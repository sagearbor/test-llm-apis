/**
 * File Processing Module
 *
 * Extracts text content from various file types for LLM consumption.
 * Security features:
 * - No code execution
 * - Metadata stripping
 * - Size limits on extracted text
 * - Safe parsing only
 */

import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { processZipFile } from './zip-processor.js';

const MAX_EXTRACTED_TEXT_LENGTH = 50000; // Max 50K characters per file

/**
 * Process a file and extract text content
 * @param {string} filePath - Absolute path to file
 * @param {string} originalName - Original filename
 * @returns {Promise<{text: string, metadata: object}>}
 */
export async function processFile(filePath, originalName) {
  const ext = path.extname(filePath).toLowerCase();

  try {
    let text = '';
    let metadata = {
      originalName,
      fileType: ext,
      processedAt: new Date().toISOString()
    };

    switch (ext) {
      // Plain text files
      case '.txt':
      case '.md':
      case '.rtf':
      case '.json':
      case '.jsonl':
      case '.xml':
      case '.yaml':
      case '.yml':
      case '.toml':
      case '.ini':
      case '.cfg':
      case '.csv':
      case '.tsv':
      case '.html':
      case '.htm':
      case '.css':
      case '.scss':
      case '.sass':
      case '.tex':
      case '.rst':
      case '.adoc':
        text = await processTextFile(filePath);
        break;

      // Code files
      case '.py':
      case '.js':
      case '.ts':
      case '.jsx':
      case '.tsx':
      case '.java':
      case '.kt':
      case '.cpp':
      case '.c':
      case '.h':
      case '.cs':
      case '.go':
      case '.rs':
      case '.rb':
      case '.php':
      case '.swift':
      case '.r':
      case '.sql':
      case '.scala':
      case '.sh':
      case '.ps1':
      case '.vue':
      case '.svelte':
        text = await processCodeFile(filePath);
        break;

      // PDF
      case '.pdf':
        text = await processPDF(filePath);
        break;

      // Microsoft Word
      case '.docx':
      case '.doc':
        text = await processDOCX(filePath);
        break;

      // Microsoft Excel
      case '.xlsx':
      case '.xls':
        text = await processExcel(filePath);
        break;

      // Jupyter Notebook
      case '.ipynb':
        text = await processJupyter(filePath);
        break;

      // ZIP files
      case '.zip':
        const zipResult = await processZipFile(filePath);
        text = zipResult.text;
        metadata.filesProcessed = zipResult.filesProcessed;
        metadata.warnings = zipResult.warnings;
        break;

      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    // Truncate if too long
    if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
      text = text.substring(0, MAX_EXTRACTED_TEXT_LENGTH);
      metadata.truncated = true;
      metadata.originalLength = text.length;
    }

    metadata.extractedLength = text.length;

    return { text, metadata };

  } catch (error) {
    console.error(`Error processing file ${originalName}:`, error);
    throw new Error(`Failed to process file: ${error.message}`);
  }
}

/**
 * Process plain text files
 */
async function processTextFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return content;
}

/**
 * Process code files (same as text, but mark as code)
 */
async function processCodeFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const ext = path.extname(filePath);
  return `\`\`\`${ext.slice(1)}\n${content}\n\`\`\``;
}

/**
 * Process PDF files
 */
async function processPDF(filePath) {
  const dataBuffer = await fs.readFile(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
}

/**
 * Process DOCX files
 */
async function processDOCX(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

/**
 * Process Excel files
 */
async function processExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  let text = '';

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    text += `\n--- Sheet: ${sheetName} ---\n`;
    text += XLSX.utils.sheet_to_csv(sheet);
    text += '\n';
  });

  return text;
}

/**
 * Process Jupyter Notebook files
 */
async function processJupyter(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const notebook = JSON.parse(content);

  let text = '# Jupyter Notebook\n\n';

  if (notebook.cells) {
    notebook.cells.forEach((cell, index) => {
      if (cell.cell_type === 'markdown') {
        text += `## Cell ${index + 1} (Markdown)\n`;
        text += cell.source.join('') + '\n\n';
      } else if (cell.cell_type === 'code') {
        text += `## Cell ${index + 1} (Code)\n`;
        text += '```python\n';
        text += cell.source.join('');
        text += '\n```\n\n';

        // Include outputs if present
        if (cell.outputs && cell.outputs.length > 0) {
          text += '### Output:\n';
          cell.outputs.forEach(output => {
            if (output.text) {
              text += output.text.join('');
            } else if (output.data && output.data['text/plain']) {
              text += output.data['text/plain'].join('');
            }
          });
          text += '\n\n';
        }
      }
    });
  }

  return text;
}

/**
 * Clean up extracted text (remove excessive whitespace, etc.)
 */
function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
    .trim();
}
