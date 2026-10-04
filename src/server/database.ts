import sqlite3 from 'sqlite3';

export interface Database {
    run(query: string, params?: any[]): Promise<sqlite3.RunResult>;
    get(query: string, params?: any[]): Promise<any>;
    all(query: string, params?: any[]): Promise<any[]>;
    close(): Promise<void>;
}

export function openDatabase(filePath: string): Database {
    const db = new (sqlite3.verbose().Database)(filePath);
    function run(query: string, params: any[] = []) {
        return new Promise<sqlite3.RunResult>((resolve, reject) => {
            db.run(query, params, function onRun(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this);
            });
        });
    }

    function get(query: string, params: any[] = []) {
        return new Promise<any>((resolve, reject) => {
            db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    }

    function all(query: string, params: any[] = []) {
        return new Promise<any[]>((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows || []);
            });
        });
    }

    return {
        run,
        get,
        all,
        close: () =>
            new Promise<void>((resolve, reject) => {
                db.close((error) => (error ? reject(error) : resolve()));
            })
    };
}
