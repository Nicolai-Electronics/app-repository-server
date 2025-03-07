import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import Path from 'path';
import { fileURLToPath } from 'url';
import fs from 'node:fs/promises';
import swagger_ui from 'swagger-ui-dist';

const port = 8001;
const repository_path = Path.join(Path.dirname(fileURLToPath(import.meta.url)), 'repository');
const data_path = '/data/apps';

const app = new express();

// Body parsers

app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: false }));

// OpenAPI

const openapi_spec_path = Path.join(Path.dirname(fileURLToPath(import.meta.url)), 'api.json');

// Swagger UI
const swagger_ui_initializer = (await fs.readFile(Path.join(swagger_ui.absolutePath(),'swagger-initializer.js')))
  .toString()
  .replace("https://petstore.swagger.io/v2/swagger.json", "/openapi");
app.get("/swagger-initializer.js", (req, res) => {
    res.setHeader('content-type', 'text/javascript');
    res.status(200).send(swagger_ui_initializer);
});
app.use(express.static(swagger_ui.absolutePath()))

app.use('/openapi', express.static(openapi_spec_path));

app.use(data_path, express.static(Path.join(repository_path, 'apps')));

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
        this.index = JSON.parse(await fs.readFile(Path.join(this.repository_path, 'index.json')), { encoding: 'utf8' });
    }

    async load_apps() {
        this.apps = {};
        let app_folders = await fs.readdir(Path.join(this.repository_path, 'apps'));
        for (let index in app_folders) {
            let slug = app_folders[index];
            let metadata = JSON.parse(await fs.readFile(Path.join(this.repository_path, 'apps', slug, 'metadata.json')), { encoding: 'utf8' });
            let files = JSON.parse(await fs.readFile(Path.join(this.repository_path, 'apps', slug, 'files.json')), { encoding: 'utf8' });
            let app = {
                metadata: metadata,
                files: files
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

    async get_app_files(slug) {
        if (slug in this.apps) {
            return this.apps[slug].files;
        }
        return null;
    }
}

let repository = new Repository(repository_path);

// Routes

app.get('/apps', async (req, res, next) => {
    // Parameters
    let offset = (typeof req.query.offset === 'number') ? req.query.offset : 0;
    let amount = (typeof req.query.amount === 'number') ? req.query.amount : null;
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
    app_slugs = app_slugs.slice(offset, amount);

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

app.get('/apps/:slug/files', async (req, res, next) => {
    let files = await repository.get_app_files(req.params.slug);
    if (files === null) {
        res.status(404).json({
            message: 'app not found',
            errors: [{
                path: req.path,
                message: 'app not found'
            }],
        });
        return;
    }
    res.json(files);
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
