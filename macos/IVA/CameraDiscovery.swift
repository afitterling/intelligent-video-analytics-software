import AVFoundation
import Foundation

struct CameraDevice: Identifiable, Hashable {
    let id: String      // AVCaptureDevice.uniqueID
    let name: String    // localizedName
    let position: String
}

enum CameraDiscovery {
    static func list() -> [CameraDevice] {
        let session = AVCaptureDevice.DiscoverySession(
            deviceTypes: [
                .builtInWideAngleCamera,
                .external,
                .deskViewCamera,
                .continuityCamera,
            ],
            mediaType: .video,
            position: .unspecified
        )
        return session.devices.map { dev in
            CameraDevice(
                id: dev.uniqueID,
                name: dev.localizedName,
                position: positionString(dev.position)
            )
        }
    }

    /// Find a camera's *index* among the macOS AVFoundation devices so we can
    /// pass it to gstreamer's `avfvideosrc device-index=N`. Matches by uniqueID
    /// against the same DiscoverySession AVF uses internally.
    static func gstIndex(for uid: String) -> Int? {
        let session = AVCaptureDevice.DiscoverySession(
            deviceTypes: [
                .builtInWideAngleCamera,
                .external,
                .deskViewCamera,
                .continuityCamera,
            ],
            mediaType: .video,
            position: .unspecified
        )
        return session.devices.firstIndex(where: { $0.uniqueID == uid })
    }

    private static func positionString(_ p: AVCaptureDevice.Position) -> String {
        switch p {
        case .front: return "front"
        case .back: return "back"
        default: return ""
        }
    }
}
