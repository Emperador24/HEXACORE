package com.hexacore.cliente.notificaciones

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.hexacore.cliente.R

private const val CANAL_ID = "entradas_recibidas"

/**
 * Notificación local que simula, en este mismo dispositivo, la que le
 * llegaría al otro usuario cuando alguien le envía una entrada — no hay
 * backend/push real todavía que la entregue en el teléfono del destinatario.
 */
object NotificacionesEntradas {

    private fun asegurarCanal(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val canal = NotificationChannel(
            CANAL_ID,
            context.getString(R.string.notif_canal_nombre),
            NotificationManager.IMPORTANCE_DEFAULT
        )
        manager.createNotificationChannel(canal)
    }

    /** true si ya se puede publicar la notificación (permiso concedido o no requerido). */
    fun tienePermiso(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    fun notificarEntradaRecibida(context: Context, remitente: String, eventoNombre: String) {
        if (!tienePermiso(context)) return
        asegurarCanal(context)

        val notificacion = NotificationCompat.Builder(context, CANAL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(context.getString(R.string.notif_titulo))
            .setContentText(context.getString(R.string.notif_texto, remitente, eventoNombre))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        val manager = context.getSystemService(NotificationManager::class.java)
        manager.notify(System.currentTimeMillis().toInt(), notificacion)
    }
}
