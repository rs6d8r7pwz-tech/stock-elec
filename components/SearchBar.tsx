'use client'

import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export default function SearchBar({ value, onChange, placeholder = 'Rechercher…' }: Props) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--gray)' }} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-9 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 bg-white"
        style={{ borderColor: value ? 'var(--blue)' : 'var(--border)', '--tw-ring-color': 'var(--blue-mid)' } as React.CSSProperties}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--gray)' }}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
