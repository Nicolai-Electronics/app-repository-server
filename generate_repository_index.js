"use strict";

import Path from 'path';
import fs from 'node:fs/promises';

async function generate_index() {
    let index = {
        categories: {}
    };

    let directories = (await fs.readdir("repository", { withFileTypes: true })).filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.')).map(dirent => dirent.name);
    for (let directory_index in directories) {
        let directory = directories[directory_index];
        try {
            console.log("Processing app", directory);
            let metadata = JSON.parse(await fs.readFile(Path.join("repository", directory, "metadata.json")));
            for (let category_index in metadata.categories) {
                let category = metadata.categories[category_index];
                let category_slug = category.toLowerCase().replace(" ", "_");
                if (!(category_slug in index.categories)) {
                    console.log("Added category", category_slug);
                    index.categories[category_slug] = {
                        name: category,
                        apps: []
                    };
                }
                index.categories[category_slug].apps.push(directory);
            }
        } catch (e) {
            console.error(directory, "failed to import:", e);
        }
    }

    await fs.writeFile("repository_index.json", JSON.stringify(index));
}

generate_index();
