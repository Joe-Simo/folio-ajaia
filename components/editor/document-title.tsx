"use client";
import { useLayoutEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";

export function DocumentTitle({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "0px";
      input.style.height = `${input.scrollHeight}px`;
    };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) {
        width = input.clientWidth;
        resize();
      }
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [value]);
  return (
    <Textarea
      ref={ref}
      rows={1}
      aria-label="Document title"
      className="document-title"
      value={value}
      readOnly={readOnly}
      maxLength={120}
      placeholder="Untitled document"
      onChange={(event) =>
        onChange(event.target.value.replace(/[\r\n]+/g, " "))
      }
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
      }}
    />
  );
}
