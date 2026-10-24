"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { validateContent } from "@/convex/documentValidation";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface DocumentEditorProps {
  content: string;
  editable: boolean;
  onChange: (content: string) => void;
  /** Increment only for an intentional external document replacement. */
  syncKey?: number;
}

function parseContent(content: string): JSONContent {
  try {
    const parsed: unknown = JSON.parse(validateContent(content));
    if (
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      parsed.type === "doc"
    ) {
      return parsed as JSONContent;
    }
  } catch {
    // A missing or older plain-text document stays readable instead of crashing.
  }
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        ...(content ? { content: [{ type: "text", text: content }] } : {}),
      },
    ],
  };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function DocumentEditor({
  content,
  editable,
  onChange,
  syncKey = 0,
}: DocumentEditorProps) {
  const [wordCount, setWordCount] = useState(0);
  const [initialContent] = useState(() => parseContent(content));
  const contentRef = useRef(content);
  contentRef.current = content;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https", "mailto"],
          isAllowedUri: (url) => /^(https?:\/\/|mailto:)/i.test(url),
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing. Good ideas begin with a first line…",
      }),
    ],
    content: initialContent,
    editable,
    editorProps: {
      attributes: {
        class: "tiptap document-content",
        "aria-label": "Document content",
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
      },
    },
    onCreate: ({ editor: current }) =>
      setWordCount(countWords(current.getText())),
    onUpdate: ({ editor: current }) => {
      setWordCount(countWords(current.getText()));
      onChangeRef.current(JSON.stringify(current.getJSON()));
    },
  });

  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    // Keystrokes live in ProseMirror. Parent echoes must not reset selection.
    const incoming = parseContent(contentRef.current);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(incoming)) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
    setWordCount(countWords(editor.getText()));
  }, [editor, syncKey]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        blockquote: current.isActive("blockquote"),
        block: current.isActive("heading", { level: 1 })
          ? "h1"
          : current.isActive("heading", { level: 2 })
            ? "h2"
            : current.isActive("heading", { level: 3 })
              ? "h3"
              : "paragraph",
        canUndo: current.can().chain().undo().run(),
        canRedo: current.can().chain().redo().run(),
      };
    },
  });

  const blockLabels: Record<string, string> = {
    paragraph: "Normal text",
    h1: "Heading 1",
    h2: "Heading 2",
    h3: "Heading 3",
  };

  if (!editor) {
    return (
      <div className="document-editor-loading" role="status">
        Opening document…
      </div>
    );
  }

  return (
    <div className="document-editor">
      {editable && (
        <div
          className="editor-toolbar"
          role="toolbar"
          aria-label="Text formatting"
        >
          <div className="toolbar-group">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              aria-label="Undo"
              title="Undo (⌘Z)"
              disabled={!state?.canUndo}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2 aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              aria-label="Redo"
              title="Redo (⌘⇧Z)"
              disabled={!state?.canRedo}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2 aria-hidden="true" />
            </Button>
          </div>
          <span className="toolbar-separator" aria-hidden="true" />
          <ToggleGroup
            type="single"
            size="sm"
            value={state?.block ?? "paragraph"}
            aria-label="Text style"
            className="toolbar-group"
            onValueChange={(value) => {
              if (!value) return;
              const chain = editor.chain();
              if (value === "paragraph") chain.setParagraph().run();
              else if (value === "h1") chain.setHeading({ level: 1 }).run();
              else if (value === "h2") chain.setHeading({ level: 2 }).run();
              else if (value === "h3") chain.setHeading({ level: 3 }).run();
              editor.view.focus();
            }}
          >
            {Object.entries(blockLabels).map(([value, label]) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="toolbar-button"
                aria-label={label}
                title={label}
                onMouseDown={(event) => event.preventDefault()}
              >
                {value === "paragraph" ? "P" : value.toUpperCase()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="toolbar-separator" aria-hidden="true" />
          <div className="toolbar-group">
            <Toggle
              size="sm"
              className="toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              pressed={state?.bold ?? false}
              aria-label="Bold"
              title="Bold (⌘B)"
              onPressedChange={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold aria-hidden="true" />
            </Toggle>
            <Toggle
              size="sm"
              className="toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              pressed={state?.italic ?? false}
              aria-label="Italic"
              title="Italic (⌘I)"
              onPressedChange={() =>
                editor.chain().focus().toggleItalic().run()
              }
            >
              <Italic aria-hidden="true" />
            </Toggle>
            <Toggle
              size="sm"
              className="toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              pressed={state?.underline ?? false}
              aria-label="Underline"
              title="Underline (⌘U)"
              onPressedChange={() =>
                editor.chain().focus().toggleUnderline().run()
              }
            >
              <Underline aria-hidden="true" />
            </Toggle>
          </div>
          <span className="toolbar-separator" aria-hidden="true" />
          <div className="toolbar-group">
            <Toggle
              size="sm"
              className="toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              pressed={state?.bulletList ?? false}
              aria-label="Bulleted list"
              title="Bulleted list"
              onPressedChange={() =>
                editor.chain().focus().toggleBulletList().run()
              }
            >
              <List aria-hidden="true" />
            </Toggle>
            <Toggle
              size="sm"
              className="toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              pressed={state?.orderedList ?? false}
              aria-label="Numbered list"
              title="Numbered list"
              onPressedChange={() =>
                editor.chain().focus().toggleOrderedList().run()
              }
            >
              <ListOrdered aria-hidden="true" />
            </Toggle>
            <Toggle
              size="sm"
              className="toolbar-button"
              onMouseDown={(event) => event.preventDefault()}
              pressed={state?.blockquote ?? false}
              aria-label="Block quote"
              title="Block quote"
              onPressedChange={() =>
                editor.chain().focus().toggleBlockquote().run()
              }
            >
              <Quote aria-hidden="true" />
            </Toggle>
          </div>
        </div>
      )}
      <EditorContent editor={editor} className="editor-content" />
      <div className="editor-footer">
        <span>
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
        <span>{editable ? "Your words, room to grow." : "View only"}</span>
      </div>
    </div>
  );
}
