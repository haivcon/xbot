/**
 * CSV Export Utility
 * Converts array of objects to CSV and triggers download.
 */
export function exportToCsv(filename, data, columns) {
    if (!data || data.length === 0) return;

    // Build header row
    const headers = columns ? columns.map(c => c.label || c.key) : Object.keys(data[0]);
    const keys = columns ? columns.map(c => c.key) : Object.keys(data[0]);

    // Build rows
    const rows = data.map(row =>
        keys.map(key => {
            let val = row[key];
            if (val === null || val === undefined) val = '';
            val = String(val).replace(/"/g, '""'); // escape quotes
            return `"${val}"`;
        }).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
