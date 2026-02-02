'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
// import Underline from '@tiptap/extension-underline';
// import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { useEffect, useState, useMemo } from 'react';

interface RichTextEditorProps {
    content: string;
    onSave: (html: string) => void;
}

const ToolbarButton = ({ onClick, isActive, children, title }: any) => (
    <button
        onClick={onClick}
        title={title}
        className={`p-2 rounded hover:bg-neutral-800 transition-colors ${isActive ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
    >
        {children}
    </button>
);

export default function RichTextEditor({ content, onSave }: RichTextEditorProps) {
    const [isEditing, setIsEditing] = useState(false);

    const extensions = useMemo(() => [
        StarterKit,
        // Underline, // Causing duplicate warning
        // Link.configure({ // Causing duplicate warning
        //     openOnClick: false,
        // }),
        Image,
        TextAlign.configure({
            types: ['heading', 'paragraph'],
        }),
    ], []);

    const editor = useEditor({
        extensions,
        content: content,
        editable: isEditing,
        editorProps: {
            attributes: {
                class: 'prose prose-sm font-serif max-w-none focus:outline-none min-h-[300px] p-4',
            },
        },
        immediatelyRender: false,
    }, [extensions]);

    // Update content if prop changes externally
    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content);
        }
    }, [content, editor]);

    // Update editable state
    useEffect(() => {
        if (editor) {
            editor.setEditable(isEditing);
        }
    }, [isEditing, editor]);

    if (!editor) {
        return null;
    }

    const handleSave = () => {
        onSave(editor.getHTML());
        setIsEditing(false);
    };

    const handleCancel = () => {
        editor.commands.setContent(content);
        setIsEditing(false);
    };

    return (
        <div className="relative group h-full flex flex-col">
            {/* Toolbar - Only visible when editing */}
            {isEditing && (
                <div className="bg-black border-b-2 border-neutral-800 p-2 flex flex-wrap gap-1 items-center sticky top-0 z-10 shadow-sm">
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        isActive={editor.isActive('bold')}
                        title="Bold"
                    >
                        <strong className="font-serif">B</strong>
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        isActive={editor.isActive('italic')}
                        title="Italic"
                    >
                        <em className="font-serif">I</em>
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        isActive={editor.isActive('underline')}
                        title="Underline"
                    >
                        <span className="underline font-serif">U</span>
                    </ToolbarButton>

                    <div className="w-px h-6 bg-neutral-700 mx-1"></div>

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        isActive={editor.isActive('heading', { level: 1 })}
                        title="H1"
                    >
                        H1
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        isActive={editor.isActive('heading', { level: 2 })}
                        title="H2"
                    >
                        H2
                    </ToolbarButton>

                    <div className="w-px h-6 bg-neutral-700 mx-1"></div>

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        isActive={editor.isActive('bulletList')}
                        title="Bullet List"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 6h13v2H8V6zm0 5h13v2H8v-2zm0 5h13v2H8v-2zM4 6h2v2H4V6zm0 5h2v2H4v-2zm0 5h2v2H4v-2z" /></svg>
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        isActive={editor.isActive('orderedList')}
                        title="Ordered List"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 6h14v2H7V6zm0 5h14v2H7v-2zm0 5h14v2H7v-2zM3 6h2v2H3V6zm0 5h2v2H3v-2zm0 5h2v2H3v-2z" /></svg>
                    </ToolbarButton>

                    <div className="w-px h-6 bg-neutral-700 mx-1"></div>

                    <ToolbarButton
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                        title="Horizontal Rule"
                    >
                        —
                    </ToolbarButton>

                    <div className="flex-1"></div>

                    {/* Action Buttons */}
                    <button
                        onClick={handleCancel}
                        className="px-3 py-1 text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-white hover:bg-neutral-800 rounded mr-2"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-3 py-1 text-xs font-bold uppercase tracking-widest bg-white text-black hover:bg-neutral-200 rounded flex items-center gap-1"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                        Save
                    </button>
                </div>
            )}

            {/* Editor Content */}
            <div className={`flex-1 overflow-y-auto ${!isEditing ? 'cursor-default' : 'bg-white'}`}>
                <EditorContent editor={editor} className="h-full" />
            </div>

            {/* Hover to Edit Overlay */}
            {!isEditing && (
                <div
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-black shadow-sm rounded-full p-2 cursor-pointer hover:bg-neutral-100"
                    onClick={() => setIsEditing(true)}
                    title="Edit Notes"
                >
                    <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                </div>
            )}
        </div>
    );
}
