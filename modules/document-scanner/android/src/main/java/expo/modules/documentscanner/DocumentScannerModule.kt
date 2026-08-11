package expo.modules.documentscanner

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class DocumentScannerModule : Module() {

    private val supportedExtensions = setOf(
        "pdf", "epub", "mobi", "doc", "docx", "xls", "xlsx",
        "ppt", "pptx", "rtf", "txt", "md", "csv",
        "zip", "rar", "7z", "tar", "cbz", "cbr",
        "json", "xml", "html", "css", "js", "ts", "jsx", "tsx",
        "java", "c", "cpp", "py", "php", "sql", "yaml", "yml"
    )

    override fun definition() = ModuleDefinition {
        Name("DocumentScanner")

        AsyncFunction("hasStoragePermission") { promise: Promise ->
            promise.resolve(checkStoragePermission())
        }

        AsyncFunction("requestStoragePermission") { promise: Promise ->
            requestStoragePermission(promise)
        }

        AsyncFunction("scanDirectory") Coroutine { path: String, extensions: List<String>? ->
            withContext(Dispatchers.IO) {
                val extFilter = extensions?.map { it.lowercase() }?.toSet() ?: supportedExtensions
                scanDirectoryRecursive(File(path), extFilter.toList())
            }
        }

        AsyncFunction("getStorageDirectories") { promise: Promise ->
            promise.resolve(getStorageDirectories())
        }

        AsyncFunction("getCommonDocumentDirs") { promise: Promise ->
            promise.resolve(getCommonDocumentDirs())
        }
    }

    private fun checkStoragePermission(): Boolean {
        val context = appContext.reactContext ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestStoragePermission(promise: Promise) {
        val context = appContext.reactContext ?: run {
            promise.resolve(false)
            return
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    private fun scanDirectoryRecursive(dir: File, extensions: List<String>): List<Map<String, Any?>> {
        val results = mutableListOf<Map<String, Any?>>()
        try {
            val files = dir.listFiles() ?: return results
            for (file in files) {
                when {
                    file.isDirectory -> {
                        if (!file.name.startsWith(".") && !isExcludedDir(file)) {
                            results.addAll(scanDirectoryRecursive(file, extensions))
                        }
                    }
                    file.isFile -> {
                        val ext = file.extension.lowercase()
                        if (extensions.contains(ext)) {
                            results.add(
                                mapOf(
                                    "name" to file.name,
                                    "path" to file.absolutePath,
                                    "uri" to Uri.fromFile(file).toString(),
                                    "size" to file.length(),
                                    "lastModified" to file.lastModified(),
                                    "extension" to ext
                                )
                            )
                        }
                    }
                }
            }
        } catch (_: SecurityException) {
        } catch (_: Exception) {
        }
        return results
    }

    private fun isExcludedDir(dir: File): Boolean {
        val name = dir.name.lowercase()
        return name == "android" || name == "data" || name == "obb" ||
                name == "cache" || name == ".thumbnails"
    }

    private fun getStorageDirectories(): List<Map<String, Any?>> {
        val dirs = mutableListOf<Map<String, Any?>>()
        val context = appContext.reactContext ?: return dirs

        val externalDirs = context.getExternalFilesDirs(null)
        for (dir in externalDirs) {
            if (dir != null && dir.exists()) {
                val root = dir.parentFile?.parentFile?.parentFile?.parentFile
                if (root != null && root.exists() && !dirs.any { it["path"] == root.absolutePath }) {
                    dirs.add(
                        mapOf(
                            "name" to "Internal Storage",
                            "path" to root.absolutePath,
                            "isRemovable" to Environment.isExternalStorageRemovable(root)
                        )
                    )
                }
            }
        }

        val sdCardPath = System.getenv("SECONDARY_STORAGE")
        if (sdCardPath != null) {
            for (path in sdCardPath.split(":")) {
                val dir = File(path)
                if (dir.exists() && dir.canRead()) {
                    dirs.add(
                        mapOf(
                            "name" to "SD Card",
                            "path" to dir.absolutePath,
                            "isRemovable" to true
                        )
                    )
                }
            }
        }

        return dirs
    }

    private fun getCommonDocumentDirs(): List<Map<String, Any?>> {
        val dirs = mutableListOf<Map<String, Any?>>()
        val commonDirs = listOf(
            Environment.DIRECTORY_DOWNLOADS to "Downloads",
            Environment.DIRECTORY_DOCUMENTS to "Documents"
        )

        for ((envDir, label) in commonDirs) {
            val dir = Environment.getExternalStoragePublicDirectory(envDir)
            if (dir != null && dir.exists() && dir.canRead()) {
                dirs.add(
                    mapOf(
                        "name" to label,
                        "path" to dir.absolutePath,
                        "uri" to Uri.fromFile(dir).toString()
                    )
                )
            }
        }

        val externalRoot = Environment.getExternalStorageDirectory()
        if (externalRoot != null && externalRoot.exists()) {
            dirs.add(
                mapOf(
                    "name" to "Internal Storage",
                    "path" to externalRoot.absolutePath,
                    "uri" to Uri.fromFile(externalRoot).toString()
                )
            )
        }

        return dirs
    }
}
