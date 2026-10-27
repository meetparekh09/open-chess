import { useState } from 'react'

interface Props {
  fen: string
  onLoad?: (fen: string) => void
}

export function FenBar({ fen, onLoad }: Props) {
  const [draft, setDraft] = useState(fen)
  const [shownFen, setShownFen] = useState(fen)
  const [copied, setCopied] = useState(false)
  if (shownFen !== fen) {
    setShownFen(fen)
    setDraft(fen)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(fen)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <form
      className="fen-bar"
      onSubmit={(event) => {
        event.preventDefault()
        onLoad?.(draft.trim())
      }}
    >
      <input
        aria-label="FEN"
        value={draft}
        readOnly={!onLoad}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
      />
      {onLoad && (
        <button type="submit" disabled={!draft.trim() || draft.trim() === fen}>
          Load
        </button>
      )}
      <button type="button" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </form>
  )
}
