"""The little cache behind the retention board.

Nothing here touches the database. These are the four behaviours anything
reaching for `TTLCache` is relying on: a hit while the entry is fresh, a miss
once it is not, the oldest entry falling out when the cache is full, and a
clear that really empties it.
"""
import time

from utils.ttl_cache import TTLCache


class TestHitsAndMisses:
    def test_a_fresh_entry_comes_back(self):
        cache = TTLCache(ttl_seconds=60)
        cache.set("k", {"expensive": True})
        assert cache.get("k") == {"expensive": True}
        assert cache.hits == 1

    def test_the_same_object_comes_back_rather_than_a_copy(self):
        """Callers share the value, which is why the docstring says to cache
        things nobody mutates."""
        cache = TTLCache(ttl_seconds=60)
        value = {"rows": [1, 2, 3]}
        cache.set("k", value)
        assert cache.get("k") is value

    def test_a_key_nobody_stored_is_a_miss(self):
        cache = TTLCache(ttl_seconds=60)
        assert cache.get("nothing here") is None
        assert cache.misses == 1

    def test_an_expired_entry_is_a_miss_and_is_dropped(self):
        cache = TTLCache(ttl_seconds=0.01)
        cache.set("k", "value")
        time.sleep(0.02)
        assert cache.get("k") is None
        assert len(cache) == 0

    def test_a_falsy_value_is_still_a_hit(self):
        """`get` returning None has to mean "not here" and not "here, empty"."""
        cache = TTLCache(ttl_seconds=60)
        cache.set("k", [])
        assert cache.get("k") == []
        assert cache.hits == 1


class TestSize:
    def test_the_least_recently_used_entry_falls_out_first(self):
        cache = TTLCache(ttl_seconds=60, maxsize=2)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.get("a")  # "a" is now the recent one, so "b" is next out
        cache.set("c", 3)

        assert cache.get("b") is None
        assert cache.get("a") == 1
        assert cache.get("c") == 3

    def test_re_setting_a_key_replaces_rather_than_grows(self):
        cache = TTLCache(ttl_seconds=60, maxsize=2)
        cache.set("a", 1)
        cache.set("a", 2)
        assert len(cache) == 1
        assert cache.get("a") == 2


class TestClear:
    def test_clear_empties_everything_including_the_counters(self):
        cache = TTLCache(ttl_seconds=60)
        cache.set("a", 1)
        cache.get("a")
        cache.clear()

        assert len(cache) == 0
        assert cache.get("a") is None
        assert cache.hits == 0
