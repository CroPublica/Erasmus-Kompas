# Erasmus+ Kompas: video script

## 1. Problem

Since twenty fourteen, only one in three Croatian primary and secondary schools has taken part in Erasmus+ KA2 partnerships. Which schools are they? Who do they work with? What are their projects about? Erasmus+ Kompas answers these questions.

### What is KA2?

KA2 is the Erasmus+ key action in which different organisations work together and share experience.

## 2. Target users

Erasmus+ Kompas is designed for schools, associations, cities, counties, citizens, journalists and researchers who want to learn more about KA2 projects.

## 3. Data sources

Our data comes from the Erasmus+ Project Results Platform and Croatia's Open Data Portal, which provides datasets from the Agency for Mobility and EU Programmes and registers of educational institutions.

## 4. Features

### Overview

You can explore data by county and topic, find projects and organisations, or ask the Assistant.

### Map

The map shows the share of schools taking part in each county: from fourteen and a half per cent in Zagreb County to almost fifty-seven per cent in Varaždin County.

### Organisations

Every organisation has its own page. For example, Gimnazija Metković has taken part in twenty-two projects and coordinated one of them. The organisation list can be filtered by county, type and period, and downloaded as a CSV, Excel or PDF file.

### Concept network

A language model extracted problems, approaches, target groups and results from the project summaries. The concept network shows related concepts, such as early school leaving and students from disadvantaged backgrounds.

### Questions

You can also simply ask the Assistant, in Croatian or English. Ask about “dropping out of school”, and the Assistant recognises school dropout by its meaning and finds five relevant projects, with examples and sources.

## 5. Technical architecture

The data is processed in Python and merged into a DuckDB database, which is used to build a static website with Astro. A language model running locally processed the summaries, and an algorithm grouped related concepts. When a user asks a question, the model only routes it. Tools retrieve the data, and code writes the answer. So the figures come from the data, not from the model.

## 6. User value

Schools can see which organisations in their county already take part in projects and what those projects are about. Citizens, journalists and researchers can easily learn more about KA2 partnerships in their area.

## 7. Further development

Planned next steps are a partner search tool, a guide for first projects, an annual data refresh and a public API.
