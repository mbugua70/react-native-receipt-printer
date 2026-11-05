#import "ReceiptPrinter.h"
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>

// ─── Image decoding ───────────────────────────────────────────────────────────
//
// Loads an image (http(s) / file URL or base64), applies its EXIF
// orientation, flattens transparency onto white and returns 8-bit grayscale
// as base64. Big images are downsampled while decoding (never below
// minWidth wide). Exact resizing, dithering and ESC/POS packing happen in JS.

static const NSUInteger kMaxSourceBytes = 20 * 1024 * 1024;
static const double kMaxPixels = 4000000.0;
static const NSTimeInterval kTimeoutSeconds = 15.0;

static NSString *const kErrorDomain = @"ReceiptPrinterImage";

static NSError *ImageError(NSString *code, NSString *message)
{
  return [NSError errorWithDomain:kErrorDomain
                             code:0
                         userInfo:@{@"code" : code, NSLocalizedDescriptionKey : message}];
}

static NSData *DownloadImage(NSURL *url, NSError **error)
{
  __block NSData *result = nil;
  __block NSError *failure = nil;
  dispatch_semaphore_t done = dispatch_semaphore_create(0);

  NSURLRequest *request = [NSURLRequest requestWithURL:url
                                           cachePolicy:NSURLRequestUseProtocolCachePolicy
                                       timeoutInterval:kTimeoutSeconds];
  NSURLSessionDataTask *task = [[NSURLSession sharedSession]
      dataTaskWithRequest:request
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *err) {
          NSInteger status = [response isKindOfClass:[NSHTTPURLResponse class]]
              ? ((NSHTTPURLResponse *)response).statusCode
              : 200;
          if (err) {
            failure = ImageError(@"NETWORK",
                                 [NSString stringWithFormat:@"Image download failed: %@",
                                                            err.localizedDescription]);
          } else if (status < 200 || status > 299) {
            failure = ImageError(@"NETWORK",
                                 [NSString stringWithFormat:@"Image download failed: HTTP %ld",
                                                            (long)status]);
          } else {
            result = data;
          }
          dispatch_semaphore_signal(done);
        }];
  [task resume];
  dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);

  if (failure) *error = failure;
  return result;
}

static NSData *LoadSource(NSString *source, NSString *sourceType, NSError **error)
{
  NSData *data = nil;

  if ([sourceType isEqualToString:@"base64"]) {
    data = [[NSData alloc] initWithBase64EncodedString:source
                                               options:NSDataBase64DecodingIgnoreUnknownCharacters];
    if (data.length == 0) {
      *error = ImageError(@"INVALID_SOURCE", @"Image base64 is not valid.");
      return nil;
    }
  } else if ([sourceType isEqualToString:@"uri"]) {
    NSURL *url = [NSURL URLWithString:source];
    NSString *scheme = url.scheme.lowercaseString;
    if (!url) {
      *error = ImageError(@"INVALID_SOURCE", @"Image URI is not valid.");
      return nil;
    }
    if ([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"]) {
      data = DownloadImage(url, error);
      if (!data) return nil;
    } else if ([scheme isEqualToString:@"file"] || scheme.length == 0) {
      NSURL *fileUrl = scheme.length ? url : [NSURL fileURLWithPath:source];
      data = [NSData dataWithContentsOfURL:fileUrl];
      if (!data) {
        *error = ImageError(@"INVALID_SOURCE",
                            [NSString stringWithFormat:@"Image file not found: %@", source]);
        return nil;
      }
    } else {
      *error = ImageError(@"INVALID_SOURCE",
                          [NSString stringWithFormat:@"Unsupported image URI scheme: %@", scheme]);
      return nil;
    }
  } else {
    *error = ImageError(@"INVALID_SOURCE", @"Unknown image source type.");
    return nil;
  }

  if (data.length > kMaxSourceBytes) {
    *error = ImageError(@"TOO_LARGE", @"Image file is larger than 20MB.");
    return nil;
  }
  return data;
}

static BOOL IsKnownFormat(NSData *data)
{
  const uint8_t *b = (const uint8_t *)data.bytes;
  NSUInteger n = data.length;
  if (n >= 4 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return YES; // PNG
  if (n >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return YES;                 // JPEG
  if (n >= 3 && b[0] == 0x47 && b[1] == 0x49 && b[2] == 0x46) return YES;                 // GIF
  if (n >= 12 && b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46 &&
      b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50) return YES;         // WEBP
  if (n >= 2 && b[0] == 0x42 && b[1] == 0x4D) return YES;                                 // BMP
  if (n >= 8 && b[4] == 0x66 && b[5] == 0x74 && b[6] == 0x79 && b[7] == 0x70) return YES; // HEIF
  return NO;
}

static NSDictionary *DecodeToGray(NSData *data, NSInteger minWidth, NSError **error)
{
  if (!IsKnownFormat(data)) {
    *error = ImageError(@"UNSUPPORTED_FORMAT",
                        @"Not a supported image format (use PNG, JPEG, WEBP, GIF or BMP).");
    return nil;
  }

  CGImageSourceRef imageSource = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
  if (!imageSource) {
    *error = ImageError(@"DECODE_FAILED", @"The image is corrupted or could not be decoded.");
    return nil;
  }

  NSDictionary *props =
      (__bridge_transfer NSDictionary *)CGImageSourceCopyPropertiesAtIndex(imageSource, 0, NULL);
  double w0 = [props[(__bridge NSString *)kCGImagePropertyPixelWidth] doubleValue];
  double h0 = [props[(__bridge NSString *)kCGImagePropertyPixelHeight] doubleValue];
  NSInteger orientation = [props[(__bridge NSString *)kCGImagePropertyOrientation] integerValue];
  if (orientation >= 5 && orientation <= 8) {
    double t = w0;
    w0 = h0;
    h0 = t;
  }
  if (w0 <= 0 || h0 <= 0) {
    CFRelease(imageSource);
    *error = ImageError(@"DECODE_FAILED", @"The image is corrupted or could not be decoded.");
    return nil;
  }

  // Same rule as Android: halve while still at least minWidth wide, then
  // keep halving if it's too many pixels.
  double sample = 1;
  while (w0 / (sample * 2) >= minWidth) sample *= 2;
  while ((w0 / sample) * (h0 / sample) > kMaxPixels) sample *= 2;

  NSDictionary *thumbOptions = @{
    (__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform : @YES,
    (__bridge NSString *)kCGImageSourceShouldCacheImmediately : @YES,
    (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize : @(ceil(MAX(w0, h0) / sample)),
  };
  CGImageRef image =
      CGImageSourceCreateThumbnailAtIndex(imageSource, 0, (__bridge CFDictionaryRef)thumbOptions);
  CFRelease(imageSource);
  if (!image) {
    *error = ImageError(@"DECODE_FAILED", @"The image is corrupted or could not be decoded.");
    return nil;
  }

  size_t w = CGImageGetWidth(image);
  size_t h = CGImageGetHeight(image);
  NSMutableData *gray = [NSMutableData dataWithLength:w * h];

  CGColorSpaceRef space = CGColorSpaceCreateDeviceGray();
  CGContextRef ctx = CGBitmapContextCreate(gray.mutableBytes, w, h, 8, w, space,
                                           (CGBitmapInfo)kCGImageAlphaNone);
  CGColorSpaceRelease(space);
  if (!ctx) {
    CGImageRelease(image);
    *error = ImageError(@"TOO_LARGE", @"Not enough memory to process the image.");
    return nil;
  }

  // White background first, so transparent pixels print as paper
  CGContextSetGrayFillColor(ctx, 1.0, 1.0);
  CGContextFillRect(ctx, CGRectMake(0, 0, w, h));
  CGContextDrawImage(ctx, CGRectMake(0, 0, w, h), image);
  CGContextRelease(ctx);
  CGImageRelease(image);

  return @{
    @"width" : @(w),
    @"height" : @(h),
    @"data" : [gray base64EncodedStringWithOptions:0],
  };
}

@implementation ReceiptPrinter
- (NSNumber *)multiply:(double)a b:(double)b {
    NSNumber *result = @(a * b);

    return result;
}

- (void)decodeImage:(NSString *)source
         sourceType:(NSString *)sourceType
           minWidth:(double)minWidth
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      NSError *error = nil;
      NSData *data = LoadSource(source, sourceType, &error);
      NSDictionary *result = data ? DecodeToGray(data, MAX(1, (NSInteger)minWidth), &error) : nil;
      if (result) {
        resolve(result);
      } else {
        NSString *code = error.userInfo[@"code"] ?: @"DECODE_FAILED";
        reject(code, error.localizedDescription ?: @"The image could not be processed.", error);
      }
    }
  });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeReceiptPrinterSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"ReceiptPrinter";
}

@end
