import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Galaxy.ai-inspired neutral palette
        canvas: "#f8f9fb",
        node: {
          DEFAULT: "#ffffff",
          border: "#e6e8ec",
          header: "#fafbfc",
        },
        port: {
          text: "#3b82f6",
          image: "#10b981",
          video: "#a855f7",
          audio: "#f59e0b",
          file: "#6b7280",
          any: "#64748b",
        },
        edge: "#2563eb",
      },
      keyframes: {
        "node-glow": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 0 rgba(37,99,235,0.45), 0 1px 3px rgba(16,24,40,0.08)",
          },
          "50%": {
            boxShadow:
              "0 0 0 6px rgba(37,99,235,0.12), 0 0 22px 2px rgba(37,99,235,0.35)",
          },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "dash": {
          to: { strokeDashoffset: "-20" },
        },
      },
      animation: {
        "node-glow": "node-glow 1.4s ease-in-out infinite",
        "fade-in": "fade-in 0.15s ease-out",
        "dash": "dash 0.6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
