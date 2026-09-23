// Minimal RFC 4180-ish CSV parser (handles quoted fields with embedded commas/quotes).
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else if (char === '\r') {
      // skip, \n handles the line break
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmpty = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
  if (nonEmpty.length === 0) return []

  const header = nonEmpty[0]
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((key, idx) => {
      obj[key] = r[idx] ?? ''
    })
    return obj
  })
}
