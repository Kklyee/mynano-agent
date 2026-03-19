"use client";

import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import "streamdown/styles.css";
import { type FC } from "react";

interface StreamdownTextProps {
  text: string;
  isAnimating?: boolean;
  className?: string;
}

export const StreamdownText: FC<StreamdownTextProps> = ({
  text,
  isAnimating = false,
  className,
}) => {
  return (
    <div className={className}>
      <Streamdown
        plugins={{ code }}
        isAnimating={isAnimating}
        caret="block"
        mode={isAnimating ? "streaming" : "static"}
        shikiTheme={["github-light", "github-dark"]}
        controls={{ code: true }}
        className="sd-custom"
      >
        {text}
      </Streamdown>
    </div>
  );
};
