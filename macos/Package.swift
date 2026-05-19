// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "IVA",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "IVA", targets: ["IVA"]),
        .executable(name: "iva-agent", targets: ["IVAAgent"]),
    ],
    targets: [
        .executableTarget(
            name: "IVA",
            path: "IVA",
            exclude: ["Info.plist"]
        ),
        .executableTarget(
            name: "IVAAgent",
            path: "IVAAgent"
        ),
    ]
)
