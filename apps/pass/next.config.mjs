/** @type {import('next').NextConfig} */
const nextConfig = {
    // Allow wallet popup windows to communicate back with the opener.
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "Cross-Origin-Opener-Policy",   value: "same-origin-allow-popups" },
                    { key: "Cross-Origin-Embedder-Policy", value: "credentialless"            },
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
