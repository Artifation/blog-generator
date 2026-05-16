"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Undo2,
  Redo2,
  Strikethrough,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
}

export function RichTextEditor({ value, onChange, readOnly }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener", target: "_blank" },
      }),
    ],
    content: value,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose",
        style: "min-height: 400px; outline: none; padding: 8px 4px;",
      },
    },
  });

  // Sync external content changes back into editor (e.g., from HTML-tab edits)
  React.useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) editor.commands.setContent(value, false);
  }, [editor, value]);

  if (!editor) {
    return <div className="muted" style={{ fontSize: 13, padding: 16 }}>Editor laadt…</div>;
  }

  return (
    <div>
      {!readOnly && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: "6px 4px",
        borderBottom: "1px solid var(--border)",
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <ToolBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold (⌘B)">
        <Bold size={14} />
      </ToolBtn>
      <ToolBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic (⌘I)">
        <Italic size={14} />
      </ToolBtn>
      <ToolBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} label="Strike">
        <Strikethrough size={14} />
      </ToolBtn>
      <Divider />
      <ToolBtn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Kop 2"
      >
        <Heading2 size={14} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="Kop 3"
      >
        <Heading3 size={14} />
      </ToolBtn>
      <Divider />
      <ToolBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bullets">
        <List size={14} />
      </ToolBtn>
      <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Genummerd">
        <ListOrdered size={14} />
      </ToolBtn>
      <ToolBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="Quote">
        <Quote size={14} />
      </ToolBtn>
      <Divider />
      <ToolBtn
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = prompt("Link URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        label="Link"
      >
        <Link2 size={14} />
      </ToolBtn>
      <Divider />
      <ToolBtn disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} label="Undo">
        <Undo2 size={14} />
      </ToolBtn>
      <ToolBtn disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} label="Redo">
        <Redo2 size={14} />
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  disabled,
  children,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 30,
        height: 30,
        display: "grid",
        placeItems: "center",
        borderRadius: 6,
        background: active ? "rgba(59,130,246,0.12)" : "transparent",
        color: active ? "var(--secondary)" : "var(--text-muted)",
        border: active ? "1px solid rgba(59,130,246,0.28)" : "1px solid transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all 0.12s",
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div style={{ width: 1, background: "var(--border)", margin: "4px 4px" }} />
  );
}
