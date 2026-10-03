package pe.chasqui.signal.turn;

import java.util.List;

public record TurnInfo(List<String> urls, String username, String credential, long ttl) {}
