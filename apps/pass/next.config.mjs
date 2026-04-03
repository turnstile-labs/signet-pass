const ARTIFACTS_UPSTREAM =
    "https://github.com/turnstile-labs/signet-pass/releases/download/artifacts-v1";

/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                // Proxy artifact requests through our domain so CORS headers apply
                // and GitHub's redirect is followed server-side, not by the browser.
                source:      "/artifacts/:file*",
                destination: `${ARTIFACTS_UPSTREAM}/:file*`,
            },
        ];
    },

    async headers() {
        return [
            {
                // Allow wallet popup windows to communicate back with the opener.
                source: "/(.*)",
                headers: [
                    { key: "Cross-Origin-Opener-Policy",   value: "same-origin-allow-popups" },
                    { key: "Cross-Origin-Embedder-Policy", value: "credentialless"            },
                ],
            },
            {
                // ZK artifact files — allow cross-origin fetches and long-term caching.
                source: "/artifacts/:path*",
                headers: [
                    { key: "Access-Control-Allow-Origin",    value: "*"              },
                    { key: "Cross-Origin-Resource-Policy",   value: "cross-origin"   },
                    { key: "Cache-Control",                  value: "public, max-age=31536000, immutable" },
                ],
            },
        ];
    },

    webpack(config, { isServer, webpack }) {
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
            "@react-native-async-storage/async-storage": false,
            "pino-pretty": false,
        };

        config.plugins.push(
            new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
                resource.request = resource.request.replace(/^node:/, "");
            })
        );

        config.ignoreWarnings = [
            { module: /web-worker[\\/]cjs[\\/]node\.js/ },
            { message: /Can't resolve '@react-native-async-storage/ },
            { message: /Can't resolve 'pino-pretty'/ },
        ];

        if (!isServer) {
            // Allow async WebAssembly (circom witness generator)
            config.experiments = { ...config.experiments, asyncWebAssembly: true };
        }

        return config;
    },
};

export default nextConfig;
