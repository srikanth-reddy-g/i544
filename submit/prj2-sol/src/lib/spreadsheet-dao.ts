import { Result, okResult, errResult } from 'cs544-js-utils';
import * as mongo from 'mongodb';

/** All that this DAO should do is maintain a persistent map from
 *  [spreadsheetName, cellId] to an expression string.
 *
 *  Most routines return an errResult with code set to 'DB' if
 *  a database error occurs.
 */

/** return a DAO for the spreadsheet ssName at URL mongodbUrl */
export async function makeSpreadsheetDao(mongodbUrl: string, ssName: string): Promise<Result<SpreadsheetDao>> {
  return SpreadsheetDao.make(mongodbUrl, ssName);
}

export class SpreadsheetDao {
  private dbUrl: string;
  private ssName: string;
  private client: mongo.MongoClient | undefined;
  private collection: mongo.Collection<any> | undefined;

  // factory method
  static async make(dbUrl: string, ssName: string): Promise<Result<SpreadsheetDao>> {
    const dao = new SpreadsheetDao();
    dao.dbUrl = dbUrl;
    dao.ssName = ssName;
    try {
      // Connect to the MongoDB database and initialize the collection
      dao.client = await mongo.MongoClient.connect(dbUrl);
      dao.collection = dao.client.db().collection(ssName);
      return okResult(dao);
    } catch (error) {
      return errResult(error.message, 'DB');
    }
  }

  /** Release all resources held by persistent spreadsheet.
   *  Specifically, close any database connections.
   */
  async close(): Promise<Result<undefined>> {
    if (this.client) {
      try {
        // Close the database connection and clean up resources
        await this.client.close();
        this.client = undefined;
        this.collection = undefined;
        return okResult(undefined);
      } catch (error) {
        return errResult(error.message, 'DB');
      }
    }
    return okResult(undefined);
  }

  /** return name of this spreadsheet */
  getSpreadsheetName(): string {
    return this.ssName;
  }

  /** Set cell with id cellId to string expr. */
  async setCellExpr(cellId: string, expr: string): Promise<Result<undefined>> {
    if (this.collection) {
      try {
        // Update or insert the cell's expression in the database collection
        await this.collection.updateOne({ _id: cellId }, { $set: { expr } }, { upsert: true });
        return okResult(undefined);
      } catch (error) {
        return errResult(error.message, 'DB');
      }
    }
    return errResult('Database connection not established', 'DB');
  }

  /** Return expr for cell cellId; return '' for an empty/unknown cell.
   */
  async query(cellId: string): Promise<Result<string>> {
    if (this.collection) {
      try {
        // Find the cell in the database collection and return its expression, or '' if not found
        const result = await this.collection.findOne({ _id: cellId });
        if (result) {
          return okResult(result.expr);
        }
        return okResult('');
      } catch (error) {
        return errResult(error.message, 'DB');
      }
    }
    return errResult('Database connection not established', 'DB');
  }

  /** Clear the contents of this spreadsheet */
  async clear(): Promise<Result<undefined>> {
    if (this.collection) {
      try {
        // Delete all documents from the database collection
        await this.collection.deleteMany({});
        return okResult(undefined);
      } catch (error) {
        return errResult(error.message, 'DB');
      }
    }
    return errResult('Database connection not established', 'DB');
  }

  /** Remove all info for cellId from this spreadsheet. */
  async remove(cellId: string): Promise<Result<undefined>> {
    if (this.collection) {
      try {
        // Delete the document for the specified cell from the database collection
        await this.collection.deleteOne({ _id: cellId });
        return okResult(undefined);
      } catch (error) {
        return errResult(error.message, 'DB');
      }
    }
    return errResult('Database connection not established', 'DB');
  }

  /** Return array of [ cellId, expr ] pairs for all cells in this
   *  spreadsheet
   */
  async getData(): Promise<Result<[string, string][]>> {
    if (this.collection) {
      try {
        // Retrieve all documents from the database collection and map them to [cellId, expr] pairs
        const results = await this.collection.find().toArray();
        const data: [string, string][] = results.map((result) => [result._id, result.expr]);
        return okResult(data);
      } catch (error) {
        return errResult(error.message, 'DB');
      }
    }
    return errResult('Database connection not established', 'DB');
  }
}
