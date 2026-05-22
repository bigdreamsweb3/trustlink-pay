export function GlobalGridBackground() {
    return (
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">


            {/* Grid layer */}
            <div
                className="absolute inset-0 opacity-[0.14]"
                style={{
                    backgroundImage: `
            linear-gradient(to right, rgba(74,190,208,0.18) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(74,190,208,0.18) 1px, transparent 1px)
          `,
                    backgroundSize: "48px 48px",
                    maskImage:
                        "radial-gradient(circle at top left, black 25%, transparent 70%)",
                    WebkitMaskImage:
                        "radial-gradient(circle at top left, black 25%, transparent 70%)",
                }}
            />

            {/* Secondary micro-grid (denser near top-left) */}
            <div
                className="absolute inset-0 opacity-[0.07]"
                style={{
                    backgroundImage: `
            linear-gradient(to right, rgba(255,122,24,0.12) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,122,24,0.12) 1px, transparent 1px)
          `,
                    backgroundSize: "16px 16px",
                    maskImage:
                        "radial-gradient(circle at top left, black 18%, transparent 65%)",
                    WebkitMaskImage:
                        "radial-gradient(circle at top left, black 18%, transparent 65%)",
                }}
            />
        </div>
    );
}