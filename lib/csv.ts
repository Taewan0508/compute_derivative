/**
 * Parses CSV text into row objects keyed by the header row.
 *
 * Quoted fields may contain commas. A doubled quote (`""`) inside quotes is
 * an escaped quote. `\r` is ignored so both `\n` and `\r\n` line endings work.
 * Blank trailing rows are dropped. A file with no data rows returns `[]`.
 *
 * @param text - Full CSV file contents, including the header line.
 * @returns One object per data row. Missing cells are empty strings.
 */
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
