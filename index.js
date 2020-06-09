/**
 * A helper static Nodejs class with a variety of string- and object-processing
 */
class Fetsch {

    /**
     * Returns an object with only those fileds of source that are mentioned in fields.
     * @param {array of strings} fields 
     * @param {object} source 
     */
    static only(fields, source) {
        // only these fields will be returned
        const needed = Object.keys(source).filter(key => fields.includes(key))

        // return a new object with needed fields and values
        return needed.reduce((result, key) => {
            return { ...result, [key]: source[key] }
        }, {})
    }

    /**
     * Prepares a string (statement) for merging into INSERT query that looks like
     * ( field1, field2, ... fieldn ) VALUES (?,?, ... ?)
     * and the corresponging array (values) to use in .execute() or .query()
     * Intented usage:
     * 
     * const {statement, values} = Fetsch.prepareStatement( item )
     * pool.execute( `INSERT INTO table_name ${statement}`, values )
     * 
     * @param {*} source - object to 
     * @param {string} type = null|insert|odu|upd  : insert - default, just insert. odu - On Duplicate Update. upd - update statement
     * @param {string|array} primary name of primary key or array of names for compound key (needed in complex types)
     * @param {string} tableName table name to apply the request to. If passed, a complete query is returned, if not - only the statement part
     * @returns {object}  of { statement, values }     * 
     */
    static prepareStatement(source, type = "insert", primary = ["id"], tableName = null ) {
        let values =[], statement = "", keys = [], fields = []
        switch (type) {

            // odu = On Duplicate Update
            case "odu":
                
                    // if string passed as primary key, put it in an array
                    if(  !Array.isArray(primary) ){
                        primary = [ primary.toString() ]
                    }

                    // filter out id fields
                    keys = Object.keys(source).filter( item => !primary.includes(item) )
                    
                    // add primary keys to source object (DON"T KNOW WHY I DID IT LIKE THIS THE FIRST TIME)
                    // for some reason I thought that the source won't hold the id values.
                    // source = {...source, ...primary}

                    // get the overall keys
                    const keysAndId = Object.keys(source)

                    fields = `\`${ keysAndId.join("`, `")}\``                     
    
                    // collect all values in an array
                    // first part for the INSERT, second part for UPDATE
                    values = [ ...keysAndId.map(key => source[key]), ...keys.map( key=> source[key] )]
                    
                    // prepare statement
                    statement =
                    (tableName ?  
                    `INSERT INTO \`${tableName}\` ` : '') + 
                    `( ${fields})  VALUES (${[...keysAndId].fill("?").join(", ")})` + 
                    ` ON DUPLICATE KEY UPDATE ${keys.map( key => `\`${key}\`=?` ).join(", ")}`
                break;
            
            case "upd":
                
                    // if string passed as primary key, put it in an array
                    if(  !Array.isArray(primary) ){
                        primary = [ primary.toString() ]
                    }

                    // filter out id fields
                    keys = Object.keys(source).filter( item => !primary.includes(item) )
                    
                    // get all needed values (first all updatable keys, then all primary keys)
                    values = [ ...keys.map( key => source[key] ), ...primary.map( key => source[key] ) ]

                    
                    // prepare statement
                    statement = (tableName ?  
                    `UPDATE \`${tableName}\`` : '') + 
                    // convert each key in 'keyname=?' string and join the strings with commas
                    ` SET ${keys.map( key => `${key}=?`).join(", ")  } ` +
                    // convert each primary key in 'keyname=?' string and join the strings with ' AND '
                    ` WHERE ${ primary.map( key => `${key}=?` ).join(" AND ") }`
                break;

            case "insert":
            default:

                keys = Object.keys(source)
                fields = `\`${keys.join("`, `")}\``

                // collect values in an array
                values = keys.map(key => source[key])
                // prepare statement
                statement =
                (tableName ?  
                `INSERT INTO \`${tableName}\` ` : '' ) + 
                 `( ${fields})  VALUES (${keys.fill("?").join(", ")})`
                break
        }


        return { statement, values }
    }

    /**
     * cudos to https://medium.com/@mhagemann/the-ultimate-way-to-slugify-a-url-string-in-javascript-b8e4a0d849e1
     * @param {*} string 
     */
    static slugify(string) {
        const a = 'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;'
        const b = 'aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------'
        const p = new RegExp(a.split('').join('|'), 'g')

        return string.toString().toLowerCase()
            .replace(/\s+/g, '-') // Replace spaces with -
            .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
            .replace(/&/g, '-and-') // Replace & with 'and'
            .replace(/[^\w\-]+/g, '') // Remove all non-word characters
            .replace(/\-\-+/g, '-') // Replace multiple - with single -
            .replace(/^-+/, '') // Trim - from start of text
            .replace(/-+$/, '') // Trim - from end of text
    }

    /**
    * Receives object with keys and default values and target object.
    * Replaces fields indicated by `fields` object with valid JSON values
    * @param {*} fields object of key => defaultValue pairs for json keys to be processed
    * @param {*} data object with fields to process
    */
    static parseJsonFields(fields, data) {
        return Object.keys(data).reduce((result, key) => {
            let item = data[key]
            const fieldKeys = Object.keys(fields)
            if (fieldKeys.includes(key)) {
                try {
                    typeof item === "string" || item === null ?                    
                        item = item ? JSON.parse(item) : fields[key] // default value from fields object
                        : item; // if it isn't a string, return it as is
                } catch (e) {
                    item = fields[key]
                }
            }
            return { ...result, [key]: item }
        }, {})
    }

    /**
     * Replace words wrapped with %..% with corresponding items from items{} object
     * E.g. 
     * items: { %name%: "Me", %age%: 12 }
     * str: "I am %name" and I'm %age% years old. That's %name%."
     * strFormat(str, items) => "I am Me and I'm 12 years old. that's Me."
     * @param {*} str 
     * @param {*} items 
     * @defaultReplaceWithOriginal {null|true|string} what to do if item not found in items. 
     *      If null, replaces with empty string (default), if true - replaces with original fragment, if anything else - replaces with it.
     */
    static strFormat( str, items, defaultReplaceWithOriginal = null ){
        return str.replace(/%\w+%/g, key => {
            return items[key] || (
                defaultReplaceWithOriginal === null ? '' : 
                defaultReplaceWithOriginal ===  true ? key : 
                defaultReplaceWithOriginal
                ) ;
        });
        
    }
}

module.exports = Fetchs
