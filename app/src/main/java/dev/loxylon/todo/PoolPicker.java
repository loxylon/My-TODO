package dev.loxylon.todo;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Pure scheduling policy, shared by foreground and alarm-driven rotation. */
public final class PoolPicker {
    public static final class Candidate {
        public final boolean enabled, pending;
        public final long lastSelected, cooldownMillis, queuedAt;
        public Candidate(boolean enabled, boolean pending, long lastSelected, long cooldownMillis, long queuedAt) {
            this.enabled = enabled; this.pending = pending;
            this.lastSelected = lastSelected; this.cooldownMillis = cooldownMillis; this.queuedAt = queuedAt;
        }
    }
    public static int choose(List<Candidate> candidates, long now, Random random) {
        List<Integer> eligible = new ArrayList<>();
        List<Double> weights = new ArrayList<>(); double total = 0;
        for (int i = 0; i < candidates.size(); i++) {
            Candidate c = candidates.get(i);
            if (c.enabled && !c.pending && (c.cooldownMillis <= 0 || c.lastSelected == 0 || now - c.lastSelected >= c.cooldownMillis)) {
                double weight = Math.max(1d, (double) now - c.queuedAt);
                eligible.add(i); weights.add(weight); total += weight;
            }
        }
        if (eligible.isEmpty()) return -1;
        double ticket = random.nextDouble() * total;
        for (int i = 0; i < eligible.size(); i++) {
            ticket -= weights.get(i); if (ticket < 0) return eligible.get(i);
        }
        return eligible.get(eligible.size()-1);
    }

    private PoolPicker() {}
}
