-- AlterEnum: separate the dps.report upload from voidlog's own processing
ALTER TYPE "LogFileStatus" ADD VALUE 'UPLOADING' BEFORE 'PARSING';
