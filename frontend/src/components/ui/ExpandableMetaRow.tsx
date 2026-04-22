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
            <span className={`${open ? "opacity-0" : "opacity-40"} transition-opacity`}>
                ::
            </span>

            {/* TEXT WRAPPER */}
            <div className="flex-1 overflow-hidden">
                <div
                    className={`
            transition-all duration-300 ease-in-out
            ${open ? "max-h-40 opacity-100" : "max-h-3 opacity-80"}
          `}
                >
                    <p className="break-words">
                        {subtitle}
                    </p>
                </div>
            </div>

            {/* TOGGLE */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((prev) => !prev);
                }}
                className="grid place-items-center rounded-full bg-pop-bg text-text"
            >
                <InfoIcon
                    className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? "rotate-180" : ""
                        }`}
                />
            </button>
        </div>
    );
}