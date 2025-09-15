import { transports, createLogger, format, Logger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { env } from 'config/env.js';

// Definicja poziomów logowania z typami
const logLevels: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Personalizacja kolorów
const customColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'cyan',
};
format.colorize().addColors(customColors);

// Format dla konsoli z kolorami
const consoleFormat = format.combine(
  format.colorize({ all: true }), // Kolory dla wszystkich poziomów
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
  }),
);

// Format dla plików (bez kolorów, JSON)
const fileFormat = format.combine(format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), format.json());

// Interfejs dla loggera z metodą debugObject
interface CustomLogger extends Logger {
  debugObject: (message: string, object: any) => void;
}

// Tworzenie loggera
const logger: CustomLogger = createLogger({
  levels: logLevels,
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: fileFormat,
  transports: [
    new transports.Console({
      format: consoleFormat,
    }),
    new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '14d',
      format: fileFormat,
    }),
    new DailyRotateFile({
      level: 'error',
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '30d',
    }),
  ],
  exceptionHandlers: [new transports.File({ filename: 'logs/exceptions.log' })],
  rejectionHandlers: [new transports.File({ filename: 'logs/rejections.log' })],
}) as CustomLogger;

// Dodanie metody debugObject (loguje tylko gdy poziom to debug lub niższy)
logger.debugObject = (message: string, object: any): void => {
  logger.debug(message, object);
};

export default logger;
