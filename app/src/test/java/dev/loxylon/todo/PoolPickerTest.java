package dev.loxylon.todo;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class PoolPickerTest {
    @Test public void ignoresExcludedPendingAndCoolingItems() {
        List<PoolPicker.Candidate> c=Arrays.asList(new PoolPicker.Candidate(false,false,0,0),new PoolPicker.Candidate(true,true,0,0),new PoolPicker.Candidate(true,false,900,200),new PoolPicker.Candidate(true,false,0,200));
        assertEquals(3,PoolPicker.choose(c,1000,new Random(1)));
    }
    @Test public void boundaryIsInclusive() { assertEquals(0,PoolPicker.choose(List.of(new PoolPicker.Candidate(true,false,800,200)),1000,new Random(1))); }
    @Test public void returnsNoneWhenNoEligibleTasks() { assertEquals(-1,PoolPicker.choose(List.of(new PoolPicker.Candidate(false,false,0,0)),1000,new Random(1))); }
    @Test public void firstSelectionIgnoresCooldown() { assertEquals(0,PoolPicker.choose(List.of(new PoolPicker.Candidate(true,false,0,999999)),1000,new Random(1))); }
    @Test public void randomSelectionCanReachEveryAvailableCandidate() { Set<Integer> selected=new HashSet<>();List<PoolPicker.Candidate> c=Arrays.asList(new PoolPicker.Candidate(true,false,0,0),new PoolPicker.Candidate(true,false,0,0),new PoolPicker.Candidate(true,false,0,0));Random random=new Random(42);for(int i=0;i<100;i++) selected.add(PoolPicker.choose(c,1000,random));assertEquals(3,selected.size()); }
}
