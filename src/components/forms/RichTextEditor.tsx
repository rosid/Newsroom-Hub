'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { BROADCAST_CUES, CUE_CLASS, cueToneClass, type BroadcastCue } from '@/lib/broadcast-cues';

/**
 * Rich text editor ringan (contentEditable + execCommand).
 * PENTING: konten awal diset lewat ref/useEffect — JANGAN pakai
 * dangerouslySetInnerHTML pada contentEditable (React akan mereset input user).
 *
 * Dilengkapi panel **Format Broadcast**: klik penanda (mis. [ANCHOR ON CAM]) untuk
 * menyisipkannya langsung di posisi kursor pada body naskah.
 */
export default function RichTextEditor({
  name,
  initialHtml = '',
  minHeight = 240,
  placeholder = 'Tulis naskah berita di sini…',
  showCues = true,
}: {
  name: string;
  initialHtml?: string;
  minHeight?: number;
  placeholder?: string;
  /** Tampilkan panel Format Broadcast (penanda rundown). */
  showCues?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(initialHtml);
  const [lastCue, setLastCue] = useState<string>('');

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialHtml) {
      ref.current.innerHTML = initialHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => setHtml(ref.current?.innerHTML ?? '');

  const exec = (cmd: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, value);
    sync();
  };

  /**
   * Sisipkan penanda format siaran di posisi kursor, sebagai baris tersendiri.
   *
   * CATATAN PENTING: memakai manipulasi DOM (Range), BUKAN execCommand('insertParagraph').
   * Diuji: execCommand menghasilkan blok `<div>` dan penanda pertama menempel pada teks
   * sebelumnya ketika editor masih berisi teks tanpa pembungkus blok (kondisi awal editor
   * kosong). Dengan memotong blok di posisi kursor secara eksplisit, penanda selalu berada
   * di paragrafnya sendiri dan kursor pindah ke paragraf berikutnya.
   */
  const insertCue = (cue: BroadcastCue) => {
    const el = ref.current;
    if (!el) return;
    el.focus();

    const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE']);
    const ensureCaret = () => {
      const sel = window.getSelection();
      if (!sel) return null;
      if (sel.rangeCount && sel.anchorNode && el.contains(sel.anchorNode)) return sel;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      return sel;
    };

    const sel = ensureCaret();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    // Blok terdekat yang memuat kursor (bila kursor langsung di root, block = null)
    let block: HTMLElement | null =
      range.startContainer instanceof HTMLElement
        ? range.startContainer
        : range.startContainer.parentElement;
    while (block && block !== el && !BLOCK_TAGS.has(block.tagName)) block = block.parentElement;
    if (block === el) block = null;

    const chip = document.createElement('span');
    chip.className = `${CUE_CLASS} ${cueToneClass(cue.tone)}`;
    chip.textContent = cue.code;

    const cueP = document.createElement('p');
    cueP.appendChild(chip);
    const nextP = document.createElement('p');

    if (block) {
      // Potong isi blok SETELAH kursor → pindahkan ke paragraf berikutnya
      const tail = range.cloneRange();
      tail.setEndAfter(block.lastChild ?? block);
      tail.extractContents().childNodes.forEach((n) => nextP.appendChild(n));

      // Bila blok kini kosong (kursor di awal baris), pakai blok itu untuk penanda
      if ((block.textContent ?? '').trim() === '') block.replaceWith(cueP);
      else block.after(cueP);
      cueP.after(nextP);
    } else {
      // Kursor langsung di root (teks belum terbungkus blok, kondisi awal editor kosong):
      // bagi menjadi paragraf depan, paragraf penanda, lalu paragraf berikutnya.
      const tail = range.cloneRange();
      tail.setEndAfter(el.lastChild ?? el);
      const frag = tail.extractContents();
      frag.childNodes.forEach((n) => nextP.appendChild(n));

      const headP = document.createElement('p');
      while (el.firstChild) headP.appendChild(el.firstChild);
      el.append(headP, cueP, nextP);
    }

    // Titik kursor untuk reporter.
    // PENTING (terbukti lewat pengujian): paragraf kosong — termasuk yang hanya berisi
    // text node kosong sisa pemotongan Range — membuat Chromium mengetikkan teks ke dalam
    // chip penanda pada paragraf sebelumnya. Karena itu text node kosong dibuang, lalu
    // paragraf diberi <br> sebagai titik kursor yang sah.
    for (const node of [...nextP.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent) node.remove();
    }
    if (!nextP.firstChild) nextP.appendChild(document.createElement('br'));

    const caret = document.createRange();
    caret.setStart(nextP, 0);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);

    sync();
    setLastCue(cue.code);
  };

  const tools: { cmd: string; icon: string; title: string; value?: string }[] = [
    { cmd: 'bold', icon: 'check', title: 'Tebal (Ctrl+B)' },
    { cmd: 'italic', icon: 'edit', title: 'Miring (Ctrl+I)' },
    { cmd: 'underline', icon: 'file', title: 'Garis bawah' },
    { cmd: 'insertUnorderedList', icon: 'list', title: 'Daftar poin' },
    { cmd: 'insertOrderedList', icon: 'chart', title: 'Daftar nomor' },
  ];

  return (
    <div className="panel overflow-hidden">
      <div className="rte-toolbar flex flex-wrap items-center gap-1 border-b border-line bg-panel2 px-2 py-1.5">
        {tools.map((t) => (
          <button
            key={t.cmd}
            type="button"
            title={t.title}
            className="btn btn-sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(t.cmd)}
          >
            <Icon name={t.icon} size={13} />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <button type="button" className="btn btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'h2')}>
          H2
        </button>
        <button type="button" className="btn btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'h3')}>
          H3
        </button>
        <button type="button" className="btn btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'p')}>
          ¶
        </button>
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          type="button"
          className="btn btn-sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt('Alamat tautan (https://…)');
            if (url) exec('createLink', url);
          }}
        >
          <Icon name="external" size={13} /> Tautan
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('removeFormat')}
        >
          <Icon name="x" size={13} /> Bersihkan format
        </button>
        <span className="ml-auto text-[11px] text-muted">{html.replace(/<[^>]*>/g, '').trim().length} karakter</span>
      </div>

      {/* Panel Format Broadcast: klik penanda → langsung masuk ke body naskah */}
      {showCues ? (
        <div
          className="flex flex-wrap items-center gap-1.5 border-b border-line bg-panel px-2 py-2"
          data-broadcast-cues
        >
          <span className="mr-1 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-muted">
            <Icon name="broadcast" size={12} /> Format Broadcast
          </span>
          {BROADCAST_CUES.map((c) => (
            <button
              key={c.code}
              type="button"
              className={`btn btn-sm ${CUE_CLASS}-btn ${cueToneClass(c.tone)}`}
              title={`${c.hint}\n\nKlik untuk menyisipkan ${c.code} di posisi kursor.`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertCue(c)}
              data-cue={c.code}
            >
              + {c.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted" role="status" aria-live="polite">
            {lastCue ? `${lastCue} disisipkan` : 'Klik penanda untuk menyisipkan di posisi kursor'}
          </span>
        </div>
      ) : null}

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        className="rte-content prose-news"
        style={{ minHeight }}
        onInput={sync}
        onBlur={sync}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
