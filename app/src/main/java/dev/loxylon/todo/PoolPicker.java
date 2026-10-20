package dev.loxylon.todo;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Pure scheduling policy, shared by foreground and alarm-driven rotation. */
public final class PoolPicker {
    public static final class Candidate {
        public final boolean enabled, pending;
        public final long lastSelected, cooldownMillis;
        public Candidate(boolean enabled, boolean pending, long lastSelected, long cooldownMillis) {
            this.enabled = enabled; this.pending = pending;
            this.lastSelected = lastSelected; this.cooldownMillis = cooldownMillis;
        }
    }
    public static int choose(List<Candidate> candidates, long now, Random random) {
        List<Integer> eligible = new ArrayList<>();
        for (int i = 0; i < candidates.size(); i++) {
            Candidate c = candidates.get(i);
            if (c.enabled && !c.pending && (c.lastSelected == 0 || now - c.lastSelected >= c.cooldownMillis)) eligible.add(i);
        }
        return eligible.isEmpty() ? -1 : eligible.get(random.nextInt(eligible.size()));
    }
    private PoolPicker() {}
}
