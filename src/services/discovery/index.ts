export { DocumentDiscoveryManager } from './discovery-manager';
export { pickAndScanFolder, rescanConnectedLocations } from './ios/folder-scanner';
export { scanMediaStore, ensureMediaStorePermissions, hasMediaStorePermissions, lookupMediaStoreItem } from './android/mediastore-scanner';
export { scanCommonDirectories, scanPath, hasFilesystemPermission, requestFilesystemPermission } from './android/filesystem-scanner';
export { validateSignature, canValidateSignature } from './signatures';
export { getExtension, getClassification, getDocumentType, getMimeType, isExcludedFile, SUPPORTED_EXTENSIONS, isImageExtension } from './registry';
