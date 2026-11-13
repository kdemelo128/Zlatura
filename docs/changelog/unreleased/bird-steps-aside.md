# The Ask Monal bird steps aside while another sheet is open

- On a phone the bird button sat over the bottom-left controls of any open sheet; it covered the comps import's "remember this mapping" checkbox, which `comps-import-flow` reported as an accessibility failure on main. The bird now hides while another sheet or dialog is open and comes back when it closes (Ask Monal's own panel keeps it, so focus returns to it).
- That checkbox is a 24 px target.
- `comps-import-flow` waits for each import sheet to close before loading the next file; it read the previous file's status line and failed about one run in three.
