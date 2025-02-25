import fs from "fs";
import path from "path";
import Constants from "../const/Constants";

class Log {
  static readonly logFolder: string = "log";
  static readonly defaultFileName: string = "default.log";
  static readonly maxFileSize: number = 5 * 1024 * 1024; // 5MB default max file size

  /**
   * Formats the current timestamp
   * @returns Formatted timestamp
   */
  static getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Formats the log message with additional metadata
   * @param message - Log message
   * @param data - Data to be logged
   * @param dataType - Type of data being logged
   * @returns Formatted log entry
   */
  static formatLogEntry(message: string, data: unknown, dataType: string): string {
    const timestamp = this.getTimestamp();
    const separator = '-'.repeat(50);
    
    let formattedData: string;
    try {
      if (typeof data === 'object') {
        formattedData = JSON.stringify(data, null, 2);
      } else {
        formattedData = String(data);
      }
    } catch (error) {
      formattedData = '[Unable to stringify data]';
    }

    return Constants.logDataType
      ? `${separator}\nTimestamp: ${timestamp}\nMessage: ${message}\nType: ${dataType}\nData:\n${formattedData}\n${separator}\n\n`
      : `${separator}\nTimestamp: ${timestamp}\nMessage: ${message}\nData:\n${formattedData}\n${separator}\n\n`;
  }

  /**
   * Rotates log file if it exceeds max size
   * @param filePath - Path to log file
   */
  static rotateLogFileIfNeeded(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size >= this.maxFileSize) {
          const rotatedFilePath = `${filePath}.${Date.now()}.old`;
          fs.renameSync(filePath, rotatedFilePath);
        }
      }
    } catch (error) {
      console.warn(`Failed to rotate log file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Writes a log entry to a file
   * @param fileName - Name of the log file
   * @param message - Log message
   * @param data - Data to be logged
   * @throws {Error} If writing to log file fails
   */
  static toFile(fileName: string = "", message: string = "", data: unknown = null): void {
    if (!Constants.log) return;

    try {
      // Use default filename if none provided
      const actualFileName = fileName.trim() || this.defaultFileName;

      // Ensure the log folder exists
      if (!fs.existsSync(this.logFolder)) {
        fs.mkdirSync(this.logFolder, { recursive: true });
      }

      const filePath = path.join(this.logFolder, actualFileName);
      
      // Rotate log file if needed
      this.rotateLogFileIfNeeded(filePath);

      // Format the log entry
      const dataType = typeof data;
      const logEntry = this.formatLogEntry(message, data, dataType);

      // Write to file
      fs.appendFileSync(filePath, logEntry, { encoding: 'utf8' });

    } catch (error) {
      const errorMessage = `Failed to write to log file ${fileName}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Writes JSON data to a CSV file
   * @param fileNameBase - Base name of the CSV file (without extension)
   * @param data - Single JSON object or array of objects to write
   * @param appendMode - Whether to append to existing file or create new
   * @throws {Error} If writing to CSV file fails
   */
  static toCsv(fileNameBase: string, data: Record<string, unknown> | Record<string, unknown>[], appendMode: boolean = true): void {
    try {
      // Ensure data is an array
      const dataArray = Array.isArray(data) ? data : [data];
      if (dataArray.length === 0) return;

      // Ensure the log folder exists
      if (!fs.existsSync(this.logFolder)) {
        fs.mkdirSync(this.logFolder, { recursive: true });
      }

      // Determine file path based on appendMode
      let filePath: string;
      if (appendMode) {
        filePath = path.join(this.logFolder, `${fileNameBase}.csv`);
      } else {
        let counter = 0;
        filePath = path.join(this.logFolder, `${fileNameBase}.csv`);
        
        while (fs.existsSync(filePath)) {
          counter++;
          filePath = path.join(this.logFolder, `${fileNameBase}_${counter}.csv`);
        }
      }

      const fileExists = fs.existsSync(filePath);

      // Get all unique headers from all objects
      const headers = new Set<string>();
      dataArray.forEach(obj => {
        Object.keys(obj).forEach(key => headers.add(key));
      });
      const headerArray = Array.from(headers);

      // Create CSV content
      let csvContent = '';

      // Always write headers for new files
      if (!fileExists) {
        csvContent = headerArray.join(',') + '\n';
      }

      // Write data rows
      dataArray.forEach(obj => {
        const row = headerArray.map(header => {
          const value = obj[header] ?? '';
          // Handle values that might contain commas or newlines
          if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        });
        csvContent += row.join(',') + '\n';
      });

      // Write to file
      if (appendMode && fileExists) {
        fs.appendFileSync(filePath, csvContent);
      } else {
        fs.writeFileSync(filePath, csvContent);
      }
    } catch (error) {
      const errorMessage = `Failed to write to CSV file ${fileNameBase}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Cleans up old log files
   * @param maxAgeDays - Maximum age of log files in days
   */
  static cleanOldLogs(maxAgeDays: number = 30): void {
    try {
      const files = fs.readdirSync(this.logFolder);
      const now = Date.now();
      
      files.forEach(file => {
        const filePath = path.join(this.logFolder, file);
        const stats = fs.statSync(filePath);
        const ageDays = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
        
        if (ageDays > maxAgeDays) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.warn(`Failed to clean old logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default Log;
