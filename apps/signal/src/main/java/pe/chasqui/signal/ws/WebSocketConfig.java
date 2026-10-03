package pe.chasqui.signal.ws;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;
import pe.chasqui.signal.config.ChasquiProperties;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final SignalHandler handler;
    private final ChasquiProperties props;

    public WebSocketConfig(SignalHandler handler, ChasquiProperties props) {
        this.handler = handler;
        this.props = props;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // El origen se valida en nuestro interceptor; "*" desactiva la comprobación same-origin de Spring.
        registry.addHandler(handler, "/ws")
                .addInterceptors(new OriginHandshakeInterceptor(props))
                .setAllowedOriginPatterns("*");
    }

    /**
     * Buffer del contenedor con margen sobre el límite lógico: así un frame algo mayor a 64 KiB
     * llega al handler, que responde {@code too-large} y cierra; uno desmesurado lo corta Tomcat (1009).
     */
    @Bean
    ServletServerContainerFactoryBean webSocketContainer() {
        ServletServerContainerFactoryBean c = new ServletServerContainerFactoryBean();
        c.setMaxTextMessageBufferSize(props.maxFrameBytes() * 2);
        c.setMaxBinaryMessageBufferSize(1024);
        return c;
    }
}
