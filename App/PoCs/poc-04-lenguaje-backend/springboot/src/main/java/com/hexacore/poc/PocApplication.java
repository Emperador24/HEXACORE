package com.hexacore.poc;

import java.util.List;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.ShallowEtagHeaderFilter;
import jakarta.servlet.Filter;
import org.springframework.context.annotation.Bean;

/**
 * Candidato Spring Boot del PoC-04.
 *
 * Expone exactamente el mismo endpoint y la misma respuesta que el candidato
 * NestJS, con las mismas dos variantes:
 *   /entradas/{id}/disponibilidad      -> responde de inmediato (overhead puro del framework)
 *   /entradas/{id}/disponibilidad-io   -> espera 2 ms (simula la BD en red)
 *
 * Detalle importante para que la comparación sea justa: por defecto Spring
 * serializa la respuesta en streaming y la envía con `Transfer-Encoding:
 * chunked`, sin `Content-Length`, mientras que NestJS envía `Content-Length` y
 * `keep-alive`. Esa diferencia hace que el cliente gestione las conexiones de
 * forma distinta y contamina la medición (aparecen errores de socket y
 * latencias infladas que no son culpa del framework). El filtro de abajo
 * bufferea la respuesta para que ambos candidatos respondan igual.
 */
@SpringBootApplication
public class PocApplication {

  private static final long ESPERA_IO_MS = 2;

  public static void main(String[] args) {
    SpringApplication.run(PocApplication.class, args);
  }

  /** Bufferea la respuesta para que salga con Content-Length, igual que NestJS. */
  @Bean
  Filter contentLengthFilter() {
    return new ShallowEtagHeaderFilter();
  }

  record Zona(String nombre, int precio, int disponibles) {}

  record Disponibilidad(String eventoId, int disponibles, List<Zona> zonas) {}

  @RestController
  @RequestMapping("/entradas")
  static class EntradasController {

    private Disponibilidad respuesta(String id) {
      return new Disponibilidad(id, 1250, List.of(
          new Zona("General", 180000, 800),
          new Zona("Platea Baja", 260000, 350),
          new Zona("Palco VIP", 420000, 100)));
    }

    @GetMapping("/{id}/disponibilidad")
    public Disponibilidad disponibilidad(@PathVariable String id) {
      return respuesta(id);
    }

    @GetMapping("/{id}/disponibilidad-io")
    public Disponibilidad disponibilidadConIo(@PathVariable String id) throws InterruptedException {
      Thread.sleep(ESPERA_IO_MS);
      return respuesta(id);
    }
  }
}
