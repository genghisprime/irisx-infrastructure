/**
 * Excel Export Utility
 * Client-side Excel file generation using native browser capabilities
 */

/**
 * Converts data array to CSV format
 * @param {Array<Object>} data - Array of objects to export
 * @param {Array<{key: string, label: string, format?: Function}>} columns - Column definitions
 * @returns {string} CSV string
 */
export function toCSV(data, columns) {
  if (!data || data.length === 0) return ''

  // Header row
  const header = columns.map(col => escapeCSV(col.label)).join(',')

  // Data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col.key]
      if (col.format) {
        value = col.format(value, row)
      }
      return escapeCSV(value)
    }).join(',')
  })

  return [header, ...rows].join('\n')
}

/**
 * Escape special characters for CSV
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Generate Excel-compatible XML spreadsheet
 * @param {Array<Object>} data - Array of objects to export
 * @param {Array<{key: string, label: string, type?: string, width?: number, format?: Function}>} columns - Column definitions
 * @param {Object} options - Export options
 * @returns {string} Excel XML string
 */
export function toExcelXML(data, columns, options = {}) {
  const { sheetName = 'Sheet1', title = '' } = options

  const styles = `
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal">
        <Alignment ss:Vertical="Bottom"/>
        <Font ss:FontName="Calibri" ss:Size="11"/>
      </Style>
      <Style ss:ID="Header">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
        <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>
        <Font ss:Color="#FFFFFF"/>
      </Style>
      <Style ss:ID="Title">
        <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
        <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1"/>
      </Style>
      <Style ss:ID="Number">
        <NumberFormat ss:Format="#,##0"/>
      </Style>
      <Style ss:ID="Currency">
        <NumberFormat ss:Format="$#,##0.00"/>
      </Style>
      <Style ss:ID="Percent">
        <NumberFormat ss:Format="0.00%"/>
      </Style>
      <Style ss:ID="Date">
        <NumberFormat ss:Format="yyyy-mm-dd"/>
      </Style>
      <Style ss:ID="DateTime">
        <NumberFormat ss:Format="yyyy-mm-dd hh:mm:ss"/>
      </Style>
    </Styles>
  `

  // Column widths
  const columnDefs = columns.map(col => {
    const width = col.width || 100
    return `<Column ss:Width="${width}"/>`
  }).join('\n')

  // Header row
  const headerCells = columns.map(col => {
    return `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXML(col.label)}</Data></Cell>`
  }).join('\n')

  // Data rows
  const dataRows = data.map(row => {
    const cells = columns.map(col => {
      let value = row[col.key]
      if (col.format) {
        value = col.format(value, row)
      }

      const type = col.type || detectType(value)
      const styleId = getStyleId(type)
      const xmlValue = formatValue(value, type)

      return `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ''}><Data ss:Type="${type}">${escapeXML(xmlValue)}</Data></Cell>`
    }).join('\n')

    return `<Row>${cells}</Row>`
  }).join('\n')

  // Title row if provided
  const titleRow = title
    ? `<Row><Cell ss:StyleID="Title" ss:MergeAcross="${columns.length - 1}"><Data ss:Type="String">${escapeXML(title)}</Data></Cell></Row>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${styles}
  <Worksheet ss:Name="${escapeXML(sheetName)}">
    <Table>
      ${columnDefs}
      ${titleRow}
      <Row>${headerCells}</Row>
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`
}

function detectType(value) {
  if (value === null || value === undefined) return 'String'
  if (typeof value === 'number') return 'Number'
  if (typeof value === 'boolean') return 'Boolean'
  if (value instanceof Date) return 'DateTime'
  return 'String'
}

function getStyleId(type) {
  const styles = {
    'Number': 'Number',
    'Currency': 'Currency',
    'Percent': 'Percent',
    'Date': 'Date',
    'DateTime': 'DateTime'
  }
  return styles[type] || null
}

function formatValue(value, type) {
  if (value === null || value === undefined) return ''
  if (type === 'DateTime' && value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

function escapeXML(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Download data as Excel file
 * @param {Array<Object>} data - Array of objects to export
 * @param {Array<{key: string, label: string, type?: string, width?: number, format?: Function}>} columns - Column definitions
 * @param {string} filename - Output filename (without extension)
 * @param {Object} options - Export options
 */
export function downloadExcel(data, columns, filename, options = {}) {
  const xml = toExcelXML(data, columns, options)
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  downloadBlob(blob, `${filename}.xls`)
}

/**
 * Download data as CSV file
 * @param {Array<Object>} data - Array of objects to export
 * @param {Array<{key: string, label: string, format?: Function}>} columns - Column definitions
 * @param {string} filename - Output filename (without extension)
 */
export function downloadCSV(data, columns, filename) {
  const csv = toCSV(data, columns)
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }) // BOM for Excel UTF-8
  downloadBlob(blob, `${filename}.csv`)
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/**
 * Multi-sheet Excel export
 * @param {Array<{name: string, data: Array, columns: Array}>} sheets - Sheet definitions
 * @param {string} filename - Output filename
 */
export function downloadMultiSheetExcel(sheets, filename) {
  const styles = `
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal">
        <Alignment ss:Vertical="Bottom"/>
        <Font ss:FontName="Calibri" ss:Size="11"/>
      </Style>
      <Style ss:ID="Header">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
        <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>
        <Font ss:Color="#FFFFFF"/>
      </Style>
      <Style ss:ID="Number">
        <NumberFormat ss:Format="#,##0"/>
      </Style>
    </Styles>
  `

  const worksheets = sheets.map(sheet => {
    const columnDefs = sheet.columns.map(col => {
      const width = col.width || 100
      return `<Column ss:Width="${width}"/>`
    }).join('\n')

    const headerCells = sheet.columns.map(col => {
      return `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXML(col.label)}</Data></Cell>`
    }).join('\n')

    const dataRows = sheet.data.map(row => {
      const cells = sheet.columns.map(col => {
        let value = row[col.key]
        if (col.format) {
          value = col.format(value, row)
        }
        const type = typeof value === 'number' ? 'Number' : 'String'
        return `<Cell${type === 'Number' ? ' ss:StyleID="Number"' : ''}><Data ss:Type="${type}">${escapeXML(value)}</Data></Cell>`
      }).join('\n')

      return `<Row>${cells}</Row>`
    }).join('\n')

    return `<Worksheet ss:Name="${escapeXML(sheet.name)}">
      <Table>
        ${columnDefs}
        <Row>${headerCells}</Row>
        ${dataRows}
      </Table>
    </Worksheet>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${styles}
  ${worksheets}
</Workbook>`

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  downloadBlob(blob, `${filename}.xls`)
}

export default {
  toCSV,
  toExcelXML,
  downloadExcel,
  downloadCSV,
  downloadMultiSheetExcel
}
