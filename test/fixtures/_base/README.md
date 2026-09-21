# Fixture base

The smallest repo that passes. Every case folder next to this one holds *only*
the file it breaks; the test harness lays the case over this base in a temp
directory and runs the real validator against the result.

That's why a case folder is usually one file. What's in the folder is what's
wrong — which is the same reason the lexicon is one word per file.
