/** @type {import('next').NextConfig} */
const nextConfig = {
    // SharedArrayBuffer is required by snarkjs Web Workers.
    // "same-origin-allow-popups" (vs strict "same-origin") still enables SharedArrayBuffer
    // isolation while allowing wallet popup windows (MetaMask, Coinbase) to communicate
    // back with the opener — required by Coinbase Wallet SDK.
    // "credentialless" COEP allows cross-origin fetches (GCS zkey downloads)
    // without requiring the remote server to set CORP headers.
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "Cross-Origin-Opener-Policy",   value: "same-origin-allow-popups" },
                    { key: "Cross-Origin-Embedder-Policy", value: "credentialless"            },
                ],
            },
            {
                // Allow the Rug Registry (or any origin) to fetch artifacts cross-origin.
                // CORP: cross-origin is required because rug-registry has COEP: require-corp.
                source: "/artifacts/:path*",
                headers: [
                    { key: "Access-Control-Allow-Origin",    value: "*"            },
                    { key: "Cross-Origin-Resource-Policy",   value: "cross-origin" },
                ],
            },
        ];
    },

    webpack(config, { isServer, webpack }) {
        if (!isServer) {
            // Polyfill / stub Node.js built-ins for the browser bundle.
            // @zk-email/helpers imports libqp which uses stream, etc.
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs:             false,
                readline:       false,
                child_process:  false,
                worker_threads: false,
                stream:         false,
                path:           false,
                crypto:         false,
                os:             false,
                dns:            false,
                net:            false,
                tls:            false,
                zlib:           false,
                http:           false,
                https:          false,
                url:            false,
                // @metamask/sdk (via wagmi connectors) tries to import this React Native
                // package in its browser bundle — stub it out.
                "@react-native-async-storage/async-storage": false,
                // WalletConnect's pino logger optionally requires pino-pretty for
                // pretty-printing; not needed in the browser bundle.
                "pino-pretty": false,
            };

            // Strip the "node:" protocol prefix so fallbacks above are applied.
            // e.g. "node:stream" → "stream" → hits the false stub above.
            config.plugins.push(
                new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
                    resource.request = resource.request.replace(/^node:/, "");
                })
            );

            // Allow async WebAssembly (used by the circom witness generator)
            config.experiments = {
                ...config.experiments,
                asyncWebAssembly: true,
            };
        }
        // Suppress the "critical dependency" spam from web-worker inside snarkjs.
        // It's a dynamic require used only in the Node.js worker path, never reached
        // by the browser bundle — safe to ignore.
        config.ignoreWarnings = [
            { module: /web-worker[\\/]cjs[\\/]node\.js/ },
            // @metamask/sdk tries to import a React Native storage module
            // in its browser bundle — not used, safe to ignore.
            { message: /Can't resolve '@react-native-async-storage/ },
            // WalletConnect's pino logger optionally requires pino-pretty —
            // not available in a web bundle, handled gracefully at runtime.
            { message: /Can't resolve 'pino-pretty'/ },
        ];

        return config;
    },

    // snarkjs ships its own workers / WASM bundles — skip Next.js bundling
    transpilePackages: [],
};

export default nextConfig;
