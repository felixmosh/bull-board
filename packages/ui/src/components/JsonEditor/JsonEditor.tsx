import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { diagnosticCount, lintGutter, lintKeymap } from '@codemirror/lint';
import { Annotation, EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  gutter,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  ViewUpdate,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { jsonSchema, updateSchema } from 'codemirror-json-schema';
import React, { HTMLProps, useEffect, useRef, useState } from 'react';

const customStyle = HighlightStyle.define([
  { tag: tags.atom, color: 'var(--hl-keyword)' },
  { tag: tags.keyword, color: 'var(--hl-keyword)' },
  { tag: tags.bool, color: 'var(--hl-keyword)' },
  { tag: tags.string, color: 'var(--hl-string)' },
  { tag: tags.number, color: 'var(--hl-number)' },
  { tag: tags.brace, color: 'var(--accent-color-d1)' },
  { tag: tags.punctuation, color: 'var(--accent-color-d1)' },
  { tag: tags.propertyName, color: 'var(--hl-type)' },
]);

const theme = EditorView.theme({
  '&': {
    height: '200px',
    backgroundColor: 'var(--input-bg)',
    border: '1px var(--input-border) solid',
    borderRadius: '0.375rem',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    marginTop: '0.25rem',
    fontSize: '0.875rem',
    transition: 'border-color 0.2s ease-out, box-shadow 0.2s ease-out',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--input-focus-border)',
    boxShadow: 'var(--input-focus-shadow)',
  },
  '.cm-gutters': {
    borderRadius: '0.375rem 0 0 0.375rem',
    backgroundColor: 'var(--json-edit-gutter-bg)',
    color: 'inherit',
    borderRight: 'var(--json-edit-gutter-border-color)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--json-edit-cursor-color)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--json-edit-gutter-active-bg)' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-tooltip': {
    padding: '0.25rem 0.5rem',
    borderRadius: '0.275rem',
    backgroundColor: 'var(--json-edit-tooltip-bg)',
    border: '1px solid var(--json-edit-tooltip-border-color)',
  },
  '.cm6-json-schema-hover--code > p': {
    margin: '0.5em 0',
  },
  '.cm-tooltip-above .cm-tooltip-arrow:before': {
    borderTop: '7px solid var(--json-edit-tooltip-border-color)',
  },
  '.cm-tooltip-above .cm-tooltip-arrow:after': {
    borderTop: '7px solid var(--json-edit-tooltip-bg)',
  },
  '.cm-selectionBackground': { background: 'var(--json-edit-selection-bg)!important' },
});

const commonExtensions = [
  gutter({ class: 'CodeMirror-lint-markers' }),
  bracketMatching(),
  highlightActiveLineGutter(),
  // basicSetup,
  closeBrackets(),
  history(),
  autocompletion(),
  lineNumbers(),
  lintGutter(),
  indentOnInput(),
  drawSelection(),
  foldGutter(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
  EditorView.lineWrapping,
  EditorState.tabSize.of(2),
  syntaxHighlighting(customStyle),
  theme,
];

const External = Annotation.define<boolean>();

interface IJsonEditorProps extends HTMLProps<HTMLInputElement> {
  doc: Record<any, any>;
  schema?: Record<any, any>;
}

export const JsonEditor = ({ doc, schema, ...inputProps }: IJsonEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<EditorView | null>(null);

  useEffect(() => {
    const onUpdate = EditorView.updateListener.of((vu: ViewUpdate) => {
      if (!inputRef.current) {
        return;
      }
      const errorCount = diagnosticCount(vu.state);

      if (
        !vu.docChanged && // waits for linter
        !vu.transactions.some((tr) => tr.annotation(External)) &&
        errorCount === 0
      ) {
        const doc = vu.state.doc;
        inputRef.current.value = doc.toString();
      } else if (errorCount > 0) {
        inputRef.current.value = '';
      }
    });

    const state = EditorState.create({
      doc: JSON.stringify(doc, null, 2),
      extensions: [commonExtensions, onUpdate, jsonSchema(schema || {})],
    });

    const editor = new EditorView({
      state,
      parent: editorRef.current!,
    });

    setEditor(editor);

    return () => editor.destroy();
  }, []);

  useEffect(
    () => {
      if (editor) {
        updateSchema(editor!, schema || {});
      }
    },
    schema ? [schema] : []
  );

  return (
    <>
      <div ref={editorRef} />
      <input type="hidden" ref={inputRef} {...inputProps} />
    </>
  );
};
