import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowed, assertMutation, assertReadOnly, SqlRefusedError } from '../src/data/sql-guard.ts';

const refused = (fn: () => void) => assert.throws(fn, SqlRefusedError);

test('lecture : SELECT et WITH ... SELECT acceptés', () => {
  assertReadOnly('SELECT 1');
  assertReadOnly('  select * from projects where id = ?');
  assertReadOnly('WITH t(id) AS (SELECT 1) SELECT id FROM t');
  assertReadOnly("SELECT 'INSERT INTO x' AS texte");
  assertReadOnly("SELECT ';' AS point_virgule");
});

test('lecture : toute écriture, DDL ou PRAGMA est refusée', () => {
  for (const sql of [
    'INSERT INTO projects (name) VALUES (1)',
    'UPDATE projects SET name = 1',
    'DELETE FROM projects',
    'DROP TABLE projects',
    'CREATE TABLE x (a)',
    'PRAGMA user_version = 3',
    'PRAGMA foreign_keys = OFF',
    'VACUUM',
    'WITH x AS (SELECT 1) INSERT INTO projects (name) SELECT * FROM x',
    'SELECT 1; DROP TABLE projects',
  ]) refused(() => assertReadOnly(sql));
});

test('ATTACH et DETACH refusés partout, même déguisés', () => {
  for (const sql of [
    "ATTACH DATABASE 'autre.db' AS x",
    "attach database 'autre.db' as x",
    "/* commentaire */ ATTACH DATABASE 'autre.db' AS x",
    "-- commentaire\nATTACH DATABASE 'autre.db' AS x",
    'DETACH DATABASE x',
  ]) {
    refused(() => assertAllowed(sql));
    refused(() => assertReadOnly(sql));
    refused(() => assertMutation(sql));
  }
});

test('mutate : seuls INSERT, UPDATE, DELETE sur les données ; jamais le journal en direct', () => {
  assertMutation('INSERT INTO projects (name) VALUES (?)');
  assertMutation('UPDATE projects SET name = ? WHERE id = ?');
  assertMutation('DELETE FROM projects WHERE id = ?');
  for (const sql of [
    'SELECT 1',
    'CREATE TABLE x (a)',
    'DROP TABLE projects',
    'PRAGMA foreign_keys = OFF',
    'INSERT INTO activity_log (at) VALUES (1)',
    'DELETE FROM activity_log',
    'UPDATE activity_log SET detail = NULL',
    'INSERT INTO projects (name) VALUES (1); DELETE FROM projects',
  ]) refused(() => assertMutation(sql));
});
