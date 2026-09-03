import AppKit
import CoreImage
import Vision

let arguments = CommandLine.arguments
guard arguments.count == 4,
      let image = NSImage(contentsOfFile: arguments[1]),
      let source = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fatalError("Usage: prepare_preview_mask.swift source.jpg mask.png depth-proxy.png")
}

let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = .accurate
request.outputPixelFormat = kCVPixelFormatType_OneComponent8
try VNImageRequestHandler(cgImage: source).perform([request])
guard let observation = request.results?.first else { fatalError("No person mask") }
let context = CIContext()
let rawMask = CIImage(cvPixelBuffer: observation.pixelBuffer)
let bounds = CGRect(x: 0, y: 0, width: source.width, height: source.height)
let mask = rawMask.transformed(by: CGAffineTransform(
    scaleX: CGFloat(source.width) / rawMask.extent.width,
    y: CGFloat(source.height) / rawMask.extent.height
)).cropped(to: bounds)
let colorSpace = CGColorSpaceCreateDeviceGray()
try context.writePNGRepresentation(of: mask, to: URL(fileURLWithPath: arguments[2]), format: .L8, colorSpace: colorSpace)

// Explicit local geometry proxy for renderer comparison, not monocular AI depth.
let proxy = mask.clampedToExtent()
    .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 28.0])
    .cropped(to: bounds)
try context.writePNGRepresentation(of: proxy, to: URL(fileURLWithPath: arguments[3]), format: .L8, colorSpace: colorSpace)
print("Wrote photo-derived person mask and labelled silhouette depth proxy: \(source.width)x\(source.height)")
