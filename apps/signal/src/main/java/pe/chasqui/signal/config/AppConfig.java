package pe.chasqui.signal.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import pe.chasqui.signal.ratelimit.FixedWindowLimiter;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AppConfig {
    @Bean
    FixedWindowLimiter joinLimiter(ChasquiProperties props, Clock clock) {
        return new FixedWindowLimiter(props.joinPerIpPerMinute(), 60_000, clock);
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
