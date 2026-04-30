import { useState } from "react";
import { InfoIcon } from "../app-icons";

type Props = {
    currentTab: string;
    subtitle: string;
};

export default function ExpandableMetaRow({
    currentTab,
    subtitle,
}: Props) {
    const [open, setOpen] = useState(false);

    return (
        <div className="flex items-start gap-1.5 max-w-[12.75rem] text-[9px] leading-3">

            {/* PREFIX */}

            <InfoIcon
                className={`h-3.5 w-3.5 transition-transform duration-300 ease-out ${open ? "rotate-180" : ""
                    }`}
            />


            {/* TEXT WRAPPER */}
            <div className="flex-1 min-w-0 overflow-hidden " onClick={(e) => {
                e.stopPropagation();
                setOpen((prev) => !prev);
            }}>
                <div
                    className={`transition-all duration-300 ease-out ${open
                        ? "max-h-40 opacity-100"
                        : "max-h-3 opacity-70"
                        }`}
                >
                    <p className="break-words leading-[1.45] text-[var(--text-soft)]">
                        {subtitle}
                    </p>
                </div>
            </div>


        </div>
    );
}