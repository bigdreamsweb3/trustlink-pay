export function GlobalGridBackground() {
    return (
        <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">


            {/* Grid layer */}
            <div
                className="absolute inset-0 opacity-[0.18]"
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
                className="absolute inset-0 opacity-[0.11]"
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

            {/* Flow lines (tech “network feel”) */}
            {/* <svg
                className="absolute inset-0 w-full h-full opacity-[0.08]"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                <defs>
                    <linearGradient id="flow" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#4abed0" />
                        <stop offset="100%" stopColor="#ff7a18" />
                    </linearGradient>
                </defs>

                <path
                    d="M0 10 C 20 5, 40 25, 100 0"
                    stroke="url(#flow)"
                    strokeWidth="0.2"
                    fill="none"
                />

                <path
                    d="M0 40 C 30 30, 60 70, 100 35"
                    stroke="url(#flow)"
                    strokeWidth="0.2"
                    fill="none"
                />

                <path
                    d="M0 80 C 20 60, 70 95, 100 70"
                    stroke="url(#flow)"
                    strokeWidth="0.2"
                    fill="none"
                />
            </svg> */}
        </div>
    );
}