---
title: Template
subtitle: A subtitle
authors:
  - John Doe
  - Rose Martin
date: 2026-08-01
doi: 10.1234/example
license: CC-BY-4.0
github: myorg/myrepo
venue: My Journal
bibliography: 
 - references.bib
citation-style: author-year # or numeric
citation-template: "{authors} ({year}). *{title}*. {container}{volume}{pages}.{doilink}"
math:
  '\sha': 'ш'
  '\dr': '\mathrm{d}#1'
  '\wb': '\mathbf{w}'
---

# First section

 This is the first section with a reference to [](#sec:test) or @sec:test and maybe [Sect. {number}](#sec:test) or {ref}`Section entitled <sec:test>`. We have also and {eq}`math_label` or [Equation %s](#math_label). Also see {ref}`fig:myfig` et {numref}`fig:myfig`. Here is a sentence with a note[^1].

A bibliographic reference: [@BerVig08, @zzz] 

[^1]: This is the content of the note.

## First subsection

Section ref: [](#sec:test) entitled {ref}`sec:test` 
We can also see {eq}`math_label` which is below!

(sec:test)=
## Second subsection
```{math}
:label: math_label

w_{t+1} = (1 + r_{t+1}) s(w_t) + y_{t+1}
``` 

:::{note}
:class: dropdown open

Section ref: [](#sec:test) et {ref}`sec:test` d 
We can also see {eq}`math_label` which is above!
:::

:::{figure} images/nothing.jpg
:name: fig:myfig

The caption
:::
