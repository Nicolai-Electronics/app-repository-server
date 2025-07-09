import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import Path from 'path';
import { fileURLToPath } from 'url';
import fs from 'node:fs/promises';
import swagger_ui from 'swagger-ui-dist';

const port = 8001;
const repository_path = Path.join(Path.dirname(fileURLToPath(import.meta.url)), 'repository');
const data_path = '/repository';

const app = new express();

// Body parsers

app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: false }));

// OpenAPI

const openapi_spec_path = Path.join(Path.dirname(fileURLToPath(import.meta.url)), 'api.json');

// Swagger UI
const swagger_ui_initializer = (await fs.readFile(Path.join(swagger_ui.absolutePath(), 'swagger-initializer.js')))
    .toString()
    .replace("https://petstore.swagger.io/v2/swagger.json", "/openapi");
app.get("/swagger-initializer.js", (req, res) => {
    res.setHeader('content-type', 'text/javascript');
    res.status(200).send(swagger_ui_initializer);
});
app.use(express.static(swagger_ui.absolutePath()))

app.use('/openapi', express.static(openapi_spec_path));

app.use(data_path, express.static(repository_path));

app.use(
    OpenApiValidator.middleware({
        apiSpec: openapi_spec_path,
        validateRequests: true,
        validateResponses: true,
    })
);

app.use((err, req, res, next) => {
    // format error
    res.status(err.status || 500).json({
        message: err.message,
        errors: err.errors,
    });
});

// Application

class Repository {
    constructor(repository_path) {
        this.repository_path = repository_path;
        this.index = {
            categories: {},
        };
        this.apps = {};
        console.log('Repository path is ', this.repository_path);
        this.load();
    }

    async load() {
        await this.load_index();
        await this.load_apps();
    }

    async load_index() {
        this.index = {
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
                    if (!(category_slug in this.index.categories)) {
                        console.log("Added category", category_slug);
                        this.index.categories[category_slug] = {
                            name: category,
                            apps: []
                        };
                    }
                    this.index.categories[category_slug].apps.push(directory); // Add slug to metadata
                }
            } catch (e) {
                console.error("Failed to add index entry for", directory, ":", e);
            }
        }
    }

    async load_apps() {
        this.apps = {};
        let app_folders = (await fs.readdir(this.repository_path, { withFileTypes: true })).filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.')).map(dirent => dirent.name);
        for (let index in app_folders) {
            let slug = app_folders[index];
            let metadata = JSON.parse(await fs.readFile(Path.join(this.repository_path, slug, 'metadata.json')), { encoding: 'utf8' });
            metadata.slug = slug; // Add slug to metadata
            let app = {
                metadata: metadata
            };
            this.apps[slug] = app;
        }
    }

    async get_categories() {
        return Object.keys(this.index.categories);
    }

    async get_category(category = null) {
        if (category === null) {
            return {
                name: 'All apps',
                apps: Object.keys(this.apps),
            };
        } else if (category in this.index.categories) {
            return this.index.categories[category];
        }
        return null;
    }

    async get_app_metadata(slug) {
        if (slug in this.apps) {
            return this.apps[slug].metadata;
        }
        return null;
    }
}

let repository = new Repository(repository_path);

// Routes

app.get('/apps', async (req, res, next) => {
    // Parameters
    let offset = ("offset" in req.query) ? Number(req.query.offset) : 0;
    if (offset === NaN) offset = 0;
    let amount = ("amount" in req.query) ? Number(req.query.amount) : null;
    if (amount === NaN) amount = 0;
    let category_name = (typeof req.query.category === 'string') ? req.query.category : null;

    // Function
    let category = await repository.get_category(category_name);
    if (category === null) {
        res.status(404).json({
            message: 'category not found',
            errors: [{
                path: req.path,
                message: 'category not found'
            }],
        });
        return;
    }
    let app_slugs = category.apps;
    if (amount === null) {
        amount = app_slugs.length;
    }
    app_slugs = app_slugs.slice(offset, offset + amount);

    let apps = [];
    for (let index in app_slugs) {
        let slug = app_slugs[index];
        apps.push(repository.get_app_metadata(slug));
    }

    res.json(await Promise.all(apps));
});

app.get('/apps/:slug', async (req, res, next) => {
    let app = await repository.get_app_metadata(req.params.slug);
    if (app === null) {
        res.status(404).json({
            message: 'app not found',
            errors: [{
                path: req.path,
                message: 'app not found'
            }],
        });
        return;
    }
    res.json(app);
});

app.get('/categories', async (req, res, next) => {
    let categories = await repository.get_categories();
    res.json(categories);
});

app.get('/information', async (req, res, next) => {
    res.json({
        "data_path": data_path
    });
});

// Server

app.listen(port, () => {
    console.log(`Server running on ${port}`);
});
