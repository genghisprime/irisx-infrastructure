/**
 * Google Sheets Integration Service
 *
 * Provides OAuth authentication and data import from Google Sheets
 */

import { google } from 'googleapis';

// OAuth2 client configuration
let oauth2Client = null;

/**
 * Initialize OAuth2 client
 */
function getOAuth2Client() {
  if (!oauth2Client) {
    oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL}/v1/imports/google/callback`
    );
  }
  return oauth2Client;
}

/**
 * Generate OAuth URL for user authorization
 * @param {string} tenantId - Tenant ID to include in state
 * @param {string} userId - User ID to include in state
 * @returns {string} Authorization URL
 */
export function generateAuthUrl(tenantId, userId) {
  const client = getOAuth2Client();

  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets.readonly'
  ];

  const state = Buffer.from(JSON.stringify({ tenantId, userId })).toString('base64');

  return client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: state,
    prompt: 'consent'
  });
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from OAuth callback
 * @returns {Promise<Object>} Tokens object with access_token and refresh_token
 */
export async function getTokensFromCode(code) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Fetch data from Google Sheets
 * @param {string} spreadsheetId - Google Sheets ID
 * @param {string} range - Sheet range (e.g., 'Sheet1!A1:Z1000')
 * @param {Object} tokens - OAuth tokens
 * @returns {Promise<Object>} Sheet data with headers and rows
 */
export async function fetchSheetData(spreadsheetId, range, tokens) {
  const client = getOAuth2Client();
  client.setCredentials(tokens);

  const sheets = google.sheets({ version: 'v4', auth: client });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return {
        success: false,
        error: 'No data found in sheet'
      };
    }

    // First row is headers
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Convert to array of objects
    const data = dataRows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });

    return {
      success: true,
      headers,
      rows: data,
      totalRows: dataRows.length,
      spreadsheetId,
      range
    };
  } catch (error) {
    console.error('[Google Sheets] Error fetching data:', error);

    if (error.code === 404) {
      return {
        success: false,
        error: 'Spreadsheet not found. Please check the URL and permissions.'
      };
    }

    if (error.code === 403) {
      return {
        success: false,
        error: 'Access denied. Please ensure the sheet is shared with your Google account.'
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to fetch sheet data'
    };
  }
}

/**
 * Get spreadsheet metadata
 * @param {string} spreadsheetId - Google Sheets ID
 * @param {Object} tokens - OAuth tokens
 * @returns {Promise<Object>} Spreadsheet metadata
 */
export async function getSpreadsheetInfo(spreadsheetId, tokens) {
  const client = getOAuth2Client();
  client.setCredentials(tokens);

  const sheets = google.sheets({ version: 'v4', auth: client });

  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties,sheets(properties)'
    });

    const spreadsheet = response.data;
    const sheetList = spreadsheet.sheets.map(sheet => ({
      title: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      rowCount: sheet.properties.gridProperties.rowCount,
      columnCount: sheet.properties.gridProperties.columnCount
    }));

    return {
      success: true,
      title: spreadsheet.properties.title,
      sheets: sheetList
    };
  } catch (error) {
    console.error('[Google Sheets] Error fetching metadata:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch spreadsheet info'
    };
  }
}

/**
 * Extract spreadsheet ID from Google Sheets URL
 * @param {string} url - Google Sheets URL
 * @returns {string|null} Spreadsheet ID or null if invalid
 */
export function extractSpreadsheetId(url) {
  // Handle different URL formats:
  // https://docs.google.com/spreadsheets/d/{id}/edit#gid=0
  // https://docs.google.com/spreadsheets/d/{id}
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}
