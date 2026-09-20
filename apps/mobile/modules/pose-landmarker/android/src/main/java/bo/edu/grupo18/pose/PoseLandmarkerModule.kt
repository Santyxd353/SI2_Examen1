package bo.edu.grupo18.pose

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class PoseLandmarkerModule : Module() {
  private var detector: PoseLandmarker? = null

  override fun definition() = ModuleDefinition {
    Name("VestidorPoseLandmarker")

    AsyncFunction("detectPose") { imageUri: String ->
      val context = appContext.reactContext ?: error("La aplicación no está disponible.")
      val uri = Uri.parse(imageUri)
      require(uri.scheme == "file") { "Solo se aceptan capturas locales." }
      val imageFile = File(requireNotNull(uri.path)).canonicalFile
      val cacheRoot = context.cacheDir.canonicalFile
      require(imageFile.path.startsWith(cacheRoot.path + File.separator)) { "La captura debe estar en la caché de la aplicación." }
      require(imageFile.isFile) { "La captura ya no existe." }

      try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        imageFile.inputStream().use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 960) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
        val bitmap = imageFile.inputStream().use { BitmapFactory.decodeStream(it, null, options) }
          ?: error("No se pudo leer la captura.")
        try {
          val landmarker = detector ?: PoseLandmarker.createFromOptions(
            context,
            PoseLandmarker.PoseLandmarkerOptions.builder()
              .setBaseOptions(BaseOptions.builder().setModelAssetPath("pose_landmarker_lite.task").build())
              .setRunningMode(RunningMode.IMAGE)
              .setNumPoses(1)
              .setMinPoseDetectionConfidence(0.55f)
              .setMinPosePresenceConfidence(0.55f)
              .build()
          ).also { detector = it }
          val result = landmarker.detect(BitmapImageBuilder(bitmap).build())
          mapOf(
            "width" to bitmap.width,
            "height" to bitmap.height,
            "landmarks" to (result.landmarks().firstOrNull()?.map { point ->
              mapOf("x" to point.x(), "y" to point.y(), "visibility" to point.visibility().orElse(0f))
            } ?: emptyList<Map<String, Float>>())
          )
        } finally {
          bitmap.recycle()
        }
      } finally {
        // expo-camera guarda takePictureAsync en caché; no retenemos fotogramas.
        imageFile.delete()
      }
    }

    Function("close") {
      detector?.close()
      detector = null
    }
  }
}
